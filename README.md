# Vector Field Visualizer 向量场可视化

[简体中文](README_CN.md) | English

An interactive, zero-dependency single-page demo of the four ways to read a vector field: **divergence ∇·F, curl ∇×F, gradient ∇f, and circulation ∮F·dr** — the sign of each quantity is visible at a glance.

Inspired by a short animation "四种理解「场」的方式".

**Live demo:** https://mathjk.github.io/vector-field-viz/

## Features

- **Animated flow field** — arrow grid + advected particles with fading trails inside a unit disk, reproducing the look of the reference video.
- **Custom functions** — enter a vector field `F = (P, Q)` or a scalar `f` (rendered as its gradient field ∇f). Plain-text input with an on-screen keypad and a live formatted formula preview.
- **Expression parser** — implicit multiplication (`2x`, `xy`, `x(y+1)`), `^` / `**`, unicode operators (`× ÷ − π √`), and 30+ elementary functions: `sin cos tan asin acos atan atan2 sinh cosh tanh asinh acosh atanh sec csc cot exp ln log lg log10 log2 sqrt cbrt abs sign floor ceil round trunc min max pow mod hypot clamp step`.
- **Quantity maps** — always-on heatmaps for divergence and curl across the whole disk (green = positive, red = negative), plus a circulation-vs-radius curve `C(r) = ∮_|p|=r F·dr`. Click any heatmap or the main canvas to move the probe point.
- **3D surface** — draggable surface of the potential function `φ` (reconstructed by path integration; for non-conservative fields the surface literally tears apart), or switch it to plot the divergence / curl / speed scalar fields. In scalar mode it shows `z = f(x,y)` with contour lines on the 2D view.
- **Presets** — one click each for `∇·F=0`, `∇×F=0`, `∮F·dr=0`, `∇f=0`, plus teaching examples like the singular vortex `F=(−y,x)/(x²+y²)` (curl ≈ 0 everywhere, yet circulation = 2π — Green's theorem fails at the singularity).
- **Numeric readout** — divergence, curl, circulation (line integral on the R=1 circle) and speed, colored by sign.

## Usage

Open `index.html` directly in a browser, or serve the folder:

```bash
python -m http.server 8000
# then visit http://localhost:8000
```

No build step, no dependencies.

## Input syntax

| You type | Meaning |
|---|---|
| `2x`, `x(y+1)`, `xy` | implicit multiplication |
| `x^2`, `x**2` | power |
| `pi` / `π`, `e` | constants |
| `sin(x)`, `exp(-x^2-y^2)` | functions need parentheses |
| `√(x^2+y^2)` or `sqrt(...)` | square root |
| `mod(x,0.5)`, `step(e,x)`, `clamp(x,a,b)` | piecewise building blocks |

## Interesting experiments

| Preset / input | What to look at |
|---|---|
| `F=(x,y)` (curl = 0) | particles stream outward; circulation curve hugs zero; smooth bowl potential |
| `F=(−y,x)` (div = 0) | particles orbit; `C(r) = 2πr²` parabola |
| Singular vortex | flat `C(r) = 2π` line — all circulation concentrated at the origin; potential surface shows a helicoidal tear |
| `f = x²−y²` (scalar) | saddle surface + hyperbolic contours |
| `P=sin(3x)`, `Q=sin(3y)` | striped div/curl heatmaps |

## Files

```
index.html   page structure
style.css    layout & theme (responsive, sticky input panel)
app.js       expression parser + all rendering (plain JS, no libraries)
```

## Development

The parser is plain JS and self-contained — `app.js` also exports `parseAST`, `compile`, `circulation` when loaded under Node, so unit tests can `require` it directly:

```bash
node --check app.js   # syntax check
```

## License

No license specified yet — for teaching/demo purposes.
