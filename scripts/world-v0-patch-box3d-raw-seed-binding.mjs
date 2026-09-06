import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const root = resolve(process.argv[2] ?? "");
if (!root) throw new Error("usage: node world-v0-patch-box3d-raw-seed-binding.mjs <box3d.js checkout>");
const path = join(root, "src", "bindings.cpp");
let source = readFileSync(path, "utf8");

const marker = `\tfunction( "b3Recording_GetSize(recording)", +[]( uintptr_t rec )\n\t{ return b3Recording_GetSize( reinterpret_cast<b3Recording*>( rec ) ); } );\n\n\t// Build a player straight from a recording (avoids marshalling the byte buffer).`;

if (!source.includes(marker)) {
  if (source.includes("b3Recording_CopyData(recording)")) {
    console.log("WORLD_V0_RAW_SEED_BINDING_PATCH already applied");
    process.exit(0);
  }
  throw new Error("pinned box3d.js recording binding marker not found; upstream drift or wrong commit");
}

const replacement = `\tfunction( "b3Recording_GetSize(recording)", +[]( uintptr_t rec )\n\t{ return b3Recording_GetSize( reinterpret_cast<b3Recording*>( rec ) ); } );\n\n\t// Audit candidate: copy the native recording bytes into a JS-owned Uint8Array.\n\t// The Uint8Array constructor copies the typed_memory_view, matching the ownership\n\t// convention already used by the wrapper's other packed return buffers.\n\tret_function( "b3Recording_CopyData(recording): Uint8Array", +[]( uintptr_t rec ) -> val\n\t{\n\t\tb3Recording* r = reinterpret_cast<b3Recording*>( rec );\n\t\tconst int size = b3Recording_GetSize( r );\n\t\tconst uint8_t* data = reinterpret_cast<const uint8_t*>( b3Recording_GetData( r ) );\n\t\tif ( data == nullptr || size <= 0 ) return val::global( "Uint8Array" ).new_( 0 );\n\t\treturn val::global( "Uint8Array" ).new_( typed_memory_view( (size_t)size, data ) );\n\t} );\n\n\t// Audit candidate: accept a JS Uint8Array as wire/rebase input. b3RecPlayer_Create\n\t// copies its input internally, so this temporary C++ vector may die immediately\n\t// after construction without coupling RecPlayer lifetime to JS or WASM scratch.\n\tfunction( "b3RecPlayer_CreateFromBytes(bytes, workerCount)", +[]( val bytes, int workerCount ) -> uintptr_t\n\t{\n\t\tconst int size = bytes["byteLength"].as<int>();\n\t\tif ( size <= 0 ) return 0;\n\t\tstd::vector<uint8_t> copy( (size_t)size );\n\t\tval view = val( typed_memory_view( copy.size(), copy.data() ) );\n\t\tview.call<void>( "set", bytes );\n\t\treturn reinterpret_cast<uintptr_t>( b3RecPlayer_Create( copy.data(), size, workerCount ) );\n\t} );\n\n\t// Build a player straight from a recording (avoids marshalling the byte buffer).`;

source = source.replace(marker, replacement);
writeFileSync(path, source);

if (!source.includes("b3Recording_CopyData(recording): Uint8Array") || !source.includes("b3RecPlayer_CreateFromBytes(bytes, workerCount)")) {
  throw new Error("raw-seed binding patch verification failed");
}
console.log("WORLD_V0_RAW_SEED_BINDING_PATCH applied");
