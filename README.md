# Marcus Ruth's Portfolio

My personal site. No framework, no build step, just a single HTML file with React and Framer Motion pulled in over a CDN, because I wanted something I could edit in one sitting and understand top to bottom.

## What's here

- **About**: short version of who I am, CS undergrad at UCF, TA for CS1 (Data Structures & Algorithms).
- **Projects**: everything I've actually shipped, from a Go CLI tool to a Redis clone written in C++ from scratch.
- **Stack**: the tools I reach for.
- **Ask Me**: a small chat interface instead of a wall of text. (Still a work in progress)
- **Contact**: a real compose box with formatting, not just a mailto link.

## Design

I wanted this to look like me, not like a template. A few things that were deliberate:

- **Minimalism.** Off-white background, one accent color, generous whitespace. Nothing fighting for attention.
- **The neural network backdrop.** A quiet, moving node and line canvas behind the interface (see `index-backdrop.html`). It's a nod to the machine learning side of what I study, and it moves slowly enough that it never distracts from the content in front of it.
- **Everything hand-built.** The compose box, the formatting toolbar, the routing, the animations, all written by hand instead of pulled from a component library. Same instinct that has me taking apart cars and writing my own key-value store: I'd rather understand the thing than assemble it from parts.

## Files

- `index.html`: the site.
- `index-backdrop.html`: same site with the neural network canvas backdrop wired in.
- `tweaks-panel.jsx`: a small dev panel for tuning the palette and layout live.
- `resume.pdf`, `avatar.jpg`: self-explanatory.

Hosted on [https://polter.sh/](https://polter.sh/)
