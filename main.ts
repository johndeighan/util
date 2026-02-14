// main.ts
import blessed from "npm:@unblessed/blessed";

// Create a screen object.
const screen = blessed.screen({
  smartCSR: true,
});

// Create a box element
const box = blessed.box({
  top: "center",
  left: "center",
  width: "50%",
  height: "50%",
  content: "Hello from {bold}Deno{/bold} and @unblessed/blessed!",
  tags: true,
  border: {
    type: "line",
  },
  style: {
    fg: "white",
    bg: "magenta",
    border: {
      fg: "#f0f0f0",
    },
  },
});

// Append our box to the screen.
screen.append(box);

// Quit on Escape, q, or Control-C.
screen.key(["escape", "q", "C-c"], function (ch, key) {
  return process.exit(0);
});

// Focus our element.
box.focus();

// Render the screen.
screen.render();