# Local LaTeX Workbench

Local LaTeX Workbench is a small VS Code extension for an Overleaf-like local writing workflow.

## Features

- Bilingual visual workbench in the LaTeX activity bar. Most actions are available as buttons, cards, and pickers.
- Create a new project from templates: Chinese article, English article, Beamer, thesis skeleton, and IEEE-style paper.
- Import a single `.tex` file into the current workspace and set it as the main file.
- Import a project from a ZIP archive.
- Export the current project as a ZIP archive.
- Export the generated PDF to a chosen location.
- Show a Structure / 目录 tree for `\part`, `\chapter`, `\section`, `\subsection`, and included `.tex` files.
- Initialize a LaTeX workspace with `main.tex`, `build/`, and `figures/`.
- Build the main TeX file with XeLaTeX twice.
- Open a right-side PDF.js preview with build, export, open, page navigation, and zoom controls.
- SyncTeX navigation in both directions: click in the PDF to jump to source, or move the TeX cursor to scroll the PDF preview.
- Auto-build on save when `localLatex.autoBuildOnSave` is enabled.
- Open the generated PDF.
- Clean generated build output.
- Add common `\usepackage{...}` entries from a picker.
- Install common or named MiKTeX packages with `mpm`.
- Install packages referenced by the current main file.
- Provide lightweight completions for common packages, environments, and commands.
- Insert an existing image as a LaTeX `figure`.
- Paste a clipboard image into `figures/` and insert a `figure`.
- Use the LaTeX activity bar image gallery to add, preview, open, and insert images.
- Use built-in snippets: `fig`, `eq`, `tbl`, `sec`, `pkg`, `ref`, and `cite`.

## Visual Workflow

Open the LaTeX activity bar and use `Workbench / 工作台`.

- `开始 / Start`: create projects from template cards.
- `当前项目 / Current Project`: initialize, build, preview, open PDF, clean, and install used packages.
- `图片 / Images`: add images or paste screenshots.
- `Structure / 目录`: browse the document outline and click a heading to jump to its source line.
- `导入导出 / Import & Export`: import ZIP, export ZIP, and export PDF.
- `常用包 / Common Packages`: add or install common packages with buttons.

## Commands

- `Local LaTeX: New Project from Template`
- `Local LaTeX: Import TeX File`
- `Local LaTeX: Import Project from ZIP`
- `Local LaTeX: Export Project as ZIP`
- `Local LaTeX: Export PDF As...`
- `Local LaTeX: Initialize Workspace`
- `Local LaTeX: Add Common Package`
- `Local LaTeX: Install MiKTeX Package`
- `Local LaTeX: Install Packages Used by Main File`
- `Local LaTeX: Build Main File`
- `Local LaTeX: Open Live Preview`
- `Local LaTeX: Open PDF`
- `Local LaTeX: Clean Build Output`
- `Local LaTeX: Insert Image as Figure`
- `Local LaTeX: Paste Clipboard Image as Figure`
- `Local LaTeX: Refresh Image Gallery`
- `Local LaTeX: Refresh Structure`

## Settings

- `localLatex.mainFile`
- `localLatex.outputDir`
- `localLatex.figuresDir`
- `localLatex.enginePath`
- `localLatex.figureWidth`
- `localLatex.autoBuildOnSave`
- `localLatex.openPreviewAfterBuild`
- `localLatex.forwardSyncOnCursor`

## Requirements

- VS Code 1.90 or newer.
- MiKTeX or TeX Live with `xelatex`, `synctex`, and package-manager tools available on PATH or in a standard install location.

## Third-Party Notices

This extension bundles PDF.js assets for the internal preview. PDF.js is licensed under Apache-2.0; see `media/pdfjs/LICENSE`.

## License

MIT. See `LICENSE`.
