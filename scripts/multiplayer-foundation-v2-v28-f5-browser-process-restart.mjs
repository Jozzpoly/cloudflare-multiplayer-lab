import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE=(process.env.MW_MF6_F5_PROCESS_BASE||"http://127.0.0.1:8787").replace(/\/$/,"");
const WS_BASE=BASE.replace(/^http/,"ws");
const RUN=process.env.MW_MF6_F5_PROCESS_RUN||`f5p-${Date.now().toString(36)}`;
const OUTPUT=process.env.MW_MF6_F5_PROCESS_OUTPUT||"mf6-f5-browser-process-restart.json";
const DEBUG_PORT=Number(process.env.MW_MF6_F5_PROCESS_DEBUG_PORT||9420);
const RESTART_GAP_MS=Number(process.env.MW_MF6_F5_PROCESS_GAP_MS||2500);
const TIMEOUT_MS=45000;
const EXPECTED_ACTORS=6;
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const assert=(value,message)=>{if(!value)throw new Error(message);};

async function waitFor(fn,label,timeout=TIMEOUT_MS){
  const deadline=Date.now()+timeout;
  let last=null;
  while(Date.now()<deadline){
    try{
      last=await fn();
      if(last)return last;
    }catch(error){last=error;}
    await sleep(50);
  }
  throw new Error(`${label} timeout · last=${last instanceof Error?last.message:JSON.stringify(last)}`);
}

function identity(message){
  return {
    worldId:message.worldId,
    worldEpoch:message.worldEpoch,
    simBuildId:message.simBuildId,
    clientSimRevision:message.clientSimRevision,
  };
}

function topologyFields(peer){
  assert(peer.topology,`${peer.playerId}: topology missing`);
  return {topologyRevision:peer.topology.revision,topologyDigest:peer.topology.digest};
}

function makeRawPeer(index){
  const playerId=`f5p-raw-${index}`;
  const ws=new WebSocket(`${WS_BASE}/world-v0/ws?player=${playerId}&run=${encodeURIComponent(RUN)}&lifecycle=mf6`);
  const peer={index,playerId,ws,messages:[],welcome:null,topology:null,latestBoundary:0,nextBatchSeq:1};
  ws.addEventListener("message",(event)=>{
    try{
      const message=JSON.parse(String(event.data));
      peer.messages.push(message);
      if(peer.messages.length>5000)peer.messages.shift();
      if(Number.isInteger(message.boundaryTick))peer.latestBoundary=Math.max(peer.latestBoundary,message.boundaryTick);
      if(Number.isInteger(message.state?.boundaryTick))peer.latestBoundary=Math.max(peer.latestBoundary,message.state.boundaryTick);
      if(message.topology?.revision&&message.topology?.digest)peer.topology=message.topology;
      if(message.type==="world_v0_welcome")peer.welcome=message;
    }catch{}
  });
  return peer;
}

async function openRawPeer(index){
  const peer=makeRawPeer(index);
  const welcome=await waitFor(()=>peer.welcome||false,`raw ${index} welcome`);
  assert(welcome.topology?.modeRevision==="multiplayer-foundation-v2-v28-dynamic-composition-r0","mf6 mode revision mismatch");
  peer.ws.send(JSON.stringify({type:"world_v0_ready",...identity(welcome),...topologyFields(peer)}));
  return peer;
}

function startFeed(peer,vector){
  let running=true;
  let nextTarget=Math.max(peer.latestBoundary+2,Number(peer.welcome?.protocolStartTick||0));
  const timer=setInterval(()=>{
    if(!running||peer.ws.readyState!==WebSocket.OPEN||!peer.topology)return;
    if(nextTarget<peer.latestBoundary+2)nextTarget=peer.latestBoundary+2;
    const horizon=peer.latestBoundary+14;
    while(nextTarget+1<=horizon){
      peer.ws.send(JSON.stringify({
        type:"world_v0_input_batch",
        ...identity(peer.welcome),
        ...topologyFields(peer),
        batchSeq:peer.nextBatchSeq++,
        records:[
          {targetTick:nextTarget,x:vector[0],z:vector[1],jump:false},
          {targetTick:nextTarget+1,x:vector[0],z:vector[1],jump:false},
        ],
      }));
      nextTarget+=2;
    }
  },35);
  return {stop(){running=false;clearInterval(timer);}};
}

async function authorityStatus(){
  const response=await fetch(`${BASE}/api/world-v0/status?run=${encodeURIComponent(RUN)}`,{cache:"no-store"});
  assert(response.ok,`authority status HTTP ${response.status}`);
  return response.json();
}

function findChrome(){
  const override=process.env.CHROME_BIN?.trim();
  if(override)return override;
  const probe=spawnSync("bash",["-lc","command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"],{encoding:"utf8"});
  const binary=probe.stdout.trim().split("\n")[0];
  if(!binary)throw new Error(`Chrome binary not found: ${probe.stderr||"no candidate"}`);
  return binary;
}

class Cdp{
  constructor(url){
    this.ws=new WebSocket(url);
    this.nextId=1;
    this.pending=new Map();
    this.opened=new Promise((resolve,reject)=>{
      this.ws.addEventListener("open",resolve,{once:true});
      this.ws.addEventListener("error",()=>reject(new Error("CDP open failed")),{once:true});
    });
    this.ws.addEventListener("message",async(event)=>{
      const raw=typeof event.data==="string"?event.data:await event.data.text();
      const message=JSON.parse(raw);
      if(!message.id)return;
      const waiter=this.pending.get(message.id);
      if(!waiter)return;
      this.pending.delete(message.id);
      if(message.error)waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
      else waiter.resolve(message.result||{});
    });
  }
  async call(method,params={},sessionId){
    await this.opened;
    const id=this.nextId++;
    return new Promise((resolve,reject)=>{
      this.pending.set(id,{resolve,reject,method});
      const payload={id,method,params};
      if(sessionId)payload.sessionId=sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }
  async eval(sessionId,expression){
    const result=await this.call("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true,userGesture:true},sessionId);
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.text||"browser evaluation failed");
    return result.result?.value;
  }
  close(){try{this.ws.close();}catch{}}
}

async function waitDebugger(){
  return waitFor(async()=>{
    try{
      const response=await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if(!response.ok)return false;
      const value=await response.json();
      return value.webSocketDebuggerUrl||false;
    }catch{return false;}
  },"Chrome debugger",20000);
}

async function launchBrowser(binary,profile){
  const child=spawn(binary,[
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-session-crashed-bubble",
    "--use-gl=angle",
    "--use-angle=swiftshader-webgl",
    "--enable-unsafe-swiftshader",
    `--remote-debugging-port=${DEBUG_PORT}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],{stdio:["ignore","ignore","pipe"]});
  const cdp=new Cdp(await waitDebugger());
  await cdp.opened;
  return {child,cdp};
}

async function attachPage(cdp,url){
  const {targetId}=await cdp.call("Target.createTarget",{url});
  const {sessionId}=await cdp.call("Target.attachToTarget",{targetId,flatten:true});
  await cdp.call("Runtime.enable",{},sessionId);
  await cdp.call("Page.enable",{},sessionId);
  await cdp.call("Page.bringToFront",{},sessionId);
  return {targetId,sessionId};
}

async function bootPage(cdp,page){
  return waitFor(
    ()=>cdp.eval(page.sessionId,'document.readyState==="complete" && document.querySelector("#enter")?.disabled===false && typeof window.__sharedYardV0Evidence==="function" && typeof window.__sharedYardV0FriendEntry==="function"'),
    "browser shell",
    30000,
  );
}

async function crashBrowser(browser){
  if(!browser)return;
  try{browser.cdp?.close();}catch{}
  if(browser.child?.exitCode===null){
    browser.child.kill("SIGKILL");
    await Promise.race([once(browser.child,"exit"),sleep(5000)]);
  }
}

function canonicalWitness(peer,selfSessionId,expected,minBoundary){
  for(const message of peer.messages){
    if(message.type!=="world_v0_consumed")continue;
    if(!Number.isInteger(message.boundaryTick)||message.boundaryTick<minBoundary)continue;
    const player=(message.players||[]).find((entry)=>entry.sessionId===selfSessionId);
    if(!player||!player.fresh)continue;
    if(Math.abs(Number(player.x)-Number(expected.x))>1e-6)continue;
    if(Math.abs(Number(player.z)-Number(expected.z))>1e-6)continue;
    return {
      boundaryTick:message.boundaryTick,
      targetTick:message.targetTick,
      x:player.x,
      z:player.z,
      source:player.source,
      fresh:Boolean(player.fresh),
    };
  }
  return null;
}

async function agencyProbe(cdp,page,authorityPeer,selfSessionId){
  const startBoundary=authorityPeer.latestBoundary;
  await cdp.eval(page.sessionId,`(() => {
    window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyD",key:"d",bubbles:true,cancelable:true}));
    return true;
  })()`);
  const engaged=await waitFor(async()=>{
    const control=await cdp.eval(page.sessionId,"window.__sharedYardV0PlayableControl?.()");
    const raw=control?.rawInput;
    const world=control?.worldInput;
    return raw&&world&&
      Math.hypot(Number(raw.x||0),Number(raw.z||0))>=0.5&&
      Math.hypot(Number(world.x||0),Number(world.z||0))>=0.5
      ?control:false;
  },"post-restart command engagement",5000);
  const expected={x:Number(engaged.worldInput.x),z:Number(engaged.worldInput.z)};
  await sleep(900);
  await cdp.eval(page.sessionId,`(() => {
    window.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyD",key:"d",bubbles:true,cancelable:true}));
    return true;
  })()`);
  const witness=await waitFor(
    ()=>canonicalWitness(authorityPeer,selfSessionId,expected,startBoundary)||false,
    "post-restart canonical agency",
    7000,
  );
  return {startBoundary,expected,witness};
}

const rawPeers=[];
const feeds=[];
const profile=mkdtempSync(join(tmpdir(),"mf6-f5-process-"));
let browser=null;
let page=null;
const result={verdict:"MF6_F5_BROWSER_PROCESS_RESTART_FAIL",run:RUN,generatedAt:new Date().toISOString(),restartGapMs:RESTART_GAP_MS};

try{
  for(let index=0;index<5;index+=1)rawPeers.push(await openRawPeer(index));
  const epoch=rawPeers[0].welcome.worldEpoch;
  assert(rawPeers.every((peer)=>peer.welcome.worldEpoch===epoch),"raw peers changed WorldEpoch");
  await waitFor(()=>rawPeers.every((peer)=>peer.topology?.revision===5)||false,"raw topology revision 5");
  const vectors=[[0.62,0],[-0.62,0],[0,0.62],[0,-0.62],[0.44,0.44]];
  rawPeers.forEach((peer,index)=>feeds.push(startFeed(peer,vectors[index])));

  const binary=findChrome();
  browser=await launchBrowser(binary,profile);
  const pageUrl=`${BASE}/world-v0/?run=${encodeURIComponent(RUN)}&lifecycle=mf6&player=mf6-browser`;
  page=await attachPage(browser.cdp,pageUrl);
  await bootPage(browser.cdp,page);
  await browser.cdp.eval(page.sessionId,'document.querySelector("#enter").click(); true');

  const before=await waitFor(async()=>{
    const e=await browser.cdp.eval(page.sessionId,"window.__sharedYardV0Evidence()");
    return e&&e.lifecycle?.mf6===true&&
      e.lifecycle?.topology?.actors?.length===EXPECTED_ACTORS&&
      e.livePhysics?.actorBodyCount===EXPECTED_ACTORS&&
      e.identity?.worldEpoch===epoch&&
      !e.runtimeFailed&&
      e.metrics?.guardMismatches===0&&
      e.metrics?.guardMatches>=8
      ?e:false;
  },"six-actor exact process baseline",50000);

  const selfSessionId=before.session.actorSessionId;
  const selfTopologyActor=before.lifecycle.topology.actors.find((actor)=>actor.sessionId===selfSessionId);
  assert(selfTopologyActor,"browser self missing from topology");
  const identityBefore={
    worldEpoch:before.identity.worldEpoch,
    actorSessionId:before.session.actorSessionId,
    netEntityId:before.session.selfNetEntityId,
    slot:selfTopologyActor.slot,
  };
  const storedBefore=await browser.cdp.eval(page.sessionId,'localStorage.getItem("shared-yard-v0-actor-sessions-v1")');
  assert(typeof storedBefore==="string"&&storedBefore.includes(identityBefore.actorSessionId),"ActorSession resume state not persisted before crash");

  // Give Chrome a bounded foreground dwell after the persisted record is observable.
  await sleep(1500);
  const authorityBeforeCrash=await authorityStatus();
  const boundaryBeforeCrash=rawPeers[0].latestBoundary;

  await crashBrowser(browser);
  browser=null;
  page=null;

  const crashState=await waitFor(async()=>{
    const status=await authorityStatus();
    const protectedDisconnect=
      status.worldEpoch===identityBefore.worldEpoch&&
      status.connectedPlayers===EXPECTED_ACTORS-1&&
      (status.protectedReservedSlots||[]).includes(identityBefore.slot);
    const expiredConnected=
      status.worldEpoch===identityBefore.worldEpoch&&
      status.connectedPlayers===EXPECTED_ACTORS&&
      (status.leaseExpiredConnectedSlots||[]).includes(identityBefore.slot);
    return protectedDisconnect||expiredConnected
      ?{...status,observation:protectedDisconnect?"protected-disconnect":"half-open-lease-expired"}
      :false;
  },"authority process-death observation",15000);

  await sleep(RESTART_GAP_MS);
  const authorityBeforeRestart=await authorityStatus();
  assert(authorityBeforeRestart.worldEpoch===identityBefore.worldEpoch,"WorldEpoch rotated during process outage");
  assert(rawPeers[0].latestBoundary>boundaryBeforeCrash+60,"authority did not advance while browser process was dead");

  browser=await launchBrowser(binary,profile);
  const targetInfos=await browser.cdp.call("Target.getTargets");
  const restoredGameTargets=(targetInfos.targetInfos||[]).filter((info)=>String(info.url||"").includes("/world-v0/"));
  assert(restoredGameTargets.length===0,`Chrome auto-restored game target; apparatus ambiguous ${JSON.stringify(restoredGameTargets)}`);

  page=await attachPage(browser.cdp,pageUrl);
  await bootPage(browser.cdp,page);
  const resumeOffer=await browser.cdp.eval(page.sessionId,`({
    entry: window.__sharedYardV0FriendEntry(),
    callsign: document.querySelector("#callsign")?.value || null,
    enterLabel: document.querySelector("#enter")?.textContent || null,
    stored: localStorage.getItem("shared-yard-v0-actor-sessions-v1")
  })`);
  assert(resumeOffer.entry?.directLinkResumable===true,`same-profile process restart not offered Resume ${JSON.stringify(resumeOffer)}`);
  assert(/Resume/.test(String(resumeOffer.enterLabel||resumeOffer.entry?.enterLabel||"")),"process restart entry label is not Resume");
  assert(typeof resumeOffer.stored==="string"&&resumeOffer.stored.includes(identityBefore.actorSessionId),"persisted ActorSession record missing after process restart");

  await browser.cdp.eval(page.sessionId,'document.querySelector("#enter").click(); true');

  const recovered=await waitFor(async()=>{
    const e=await browser.cdp.eval(page.sessionId,"window.__sharedYardV0Evidence()");
    if(!e||e.runtimeFailed)return false;
    return e.identity?.worldEpoch===identityBefore.worldEpoch&&
      e.session?.actorSessionId===identityBefore.actorSessionId&&
      e.session?.selfNetEntityId===identityBefore.netEntityId&&
      e.lifecycle?.topology?.actors?.length===EXPECTED_ACTORS&&
      e.livePhysics?.actorBodyCount===EXPECTED_ACTORS&&
      e.metrics?.guardMismatches===0&&
      e.metrics?.guardMatches>=8
      ?e:false;
  },"same-identity exact process restart recovery",35000);

  const agency=await agencyProbe(browser.cdp,page,rawPeers[0],selfSessionId);
  const after=await waitFor(async()=>{
    const e=await browser.cdp.eval(page.sessionId,"window.__sharedYardV0Evidence()");
    return e&&!e.runtimeFailed&&e.metrics?.guardMismatches===0?e:false;
  },"post-process-restart exact settle",10000);
  const authorityAfter=await authorityStatus();

  Object.assign(result,{
    verdict:"MF6_F5_BROWSER_PROCESS_RESTART_COMPLETE",
    identity:{
      before:identityBefore,
      after:{
        worldEpoch:after.identity.worldEpoch,
        actorSessionId:after.session.actorSessionId,
        netEntityId:after.session.selfNetEntityId,
      },
      preserved:
        after.identity.worldEpoch===identityBefore.worldEpoch&&
        after.session.actorSessionId===identityBefore.actorSessionId&&
        after.session.selfNetEntityId===identityBefore.netEntityId,
    },
    crash:{
      mechanism:"SIGKILL Chromium process",
      authorityObservation:crashState.observation,
      connectedPlayers:crashState.connectedPlayers,
      protectedReservedSlots:crashState.protectedReservedSlots||[],
      leaseExpiredConnectedSlots:crashState.leaseExpiredConnectedSlots||[],
      authorityBoundaryBeforeCrash:authorityBeforeCrash.boundaryTick,
      authorityBoundaryBeforeRestart:authorityBeforeRestart.boundaryTick,
      authorityProgressTicks:authorityBeforeRestart.boundaryTick-authorityBeforeCrash.boundaryTick,
      restartGapMs:RESTART_GAP_MS,
    },
    resumeOffer:{
      directLinkResumable:resumeOffer.entry?.directLinkResumable,
      entryLabel:resumeOffer.entry?.enterLabel||resumeOffer.enterLabel,
      callsign:resumeOffer.callsign,
      persistedRecordPresent:typeof resumeOffer.stored==="string"&&resumeOffer.stored.includes(identityBefore.actorSessionId),
    },
    recovery:{
      guardMatches:recovered.metrics.guardMatches,
      guardMismatches:recovered.metrics.guardMismatches,
      firstStateMismatch:recovered.metrics.firstStateMismatch,
      rebases:recovered.metrics.rebases,
      corrections:recovered.metrics.corrections,
      networkState:recovered.networkState,
      actorResumePending:Boolean(recovered.session?.actorResume?.pending),
      lifecycleEvents:(recovered.lifecycleEvents||[]).filter((event)=>/resume|rebase/i.test(String(event.type||""))),
    },
    postRestartAgency:agency,
    final:{
      guardMismatches:after.metrics.guardMismatches,
      firstStateMismatch:after.metrics.firstStateMismatch,
      authorityBoundary:authorityAfter.boundaryTick,
      authorityConnectedPlayers:authorityAfter.connectedPlayers,
      topologyRevision:after.lifecycle?.topology?.revision,
      actorCount:after.lifecycle?.topology?.actors?.length,
    },
    interpretation:"The Chromium process is killed abruptly while five remote actors continue the shared MF6 authority. A new Chromium process using the same browser profile reopens the direct Yard URL, proves a stored authority-backed Resume offer, restores the same WorldEpoch/ActorSession/NetEntity exactly, then produces a fresh authority-consumed command.",
    nonClaim:"This is same-machine same-profile browser-process crash/restart evidence. It does not prove cross-device identity, OS device sleep/wake, mobile app eviction, permanent process loss, or recovery after protected ActorSession authority expires.",
  });
  writeFileSync(OUTPUT,JSON.stringify(result,null,2));
  console.log("MF6_F5_BROWSER_PROCESS_RESTART",JSON.stringify(result));
  console.log(result.verdict);
}catch(error){
  result.error=error instanceof Error?error.stack||error.message:String(error);
  writeFileSync(OUTPUT,JSON.stringify(result,null,2));
  console.error(result.error);
  process.exitCode=1;
}finally{
  for(const feed of feeds)try{feed.stop();}catch{}
  for(const peer of rawPeers)try{peer.ws.close(1000,"mf6_f5_process_restart_done");}catch{}
  try{await crashBrowser(browser);}catch{}
  try{rmSync(profile,{recursive:true,force:true});}catch{}
}
