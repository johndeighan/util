import { debounce } from "@std/async/debounce";
const log = debounce((event: Deno.FsEvent) => {
  console.log("[%s] %s", event.kind, event.paths[0]);
}, 200);

let watcher = Deno.watchFs(Deno.cwd());

for await (const event of watcher) {
  log(event);
}

