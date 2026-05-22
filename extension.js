const vscode = require('vscode');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const imageExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.pdf']);
const COMMON_PACKAGES = [
  { label: 'graphicx', description: 'Images and \\includegraphics', install: 'graphics' },
  { label: 'amsmath', description: 'Math environments and equations', install: 'amsmath' },
  { label: 'amssymb', description: 'AMS math symbols', install: 'amsfonts' },
  { label: 'mathtools', description: 'Enhancements for amsmath', install: 'mathtools' },
  { label: 'geometry', description: 'Page margins and layout', install: 'geometry' },
  { label: 'hyperref', description: 'Links and PDF metadata', install: 'hyperref' },
  { label: 'cleveref', description: 'Smart references', install: 'cleveref' },
  { label: 'booktabs', description: 'Publication-quality tables', install: 'booktabs' },
  { label: 'longtable', description: 'Multi-page tables', install: 'longtable' },
  { label: 'tabularx', description: 'Flexible-width tables', install: 'tabularx' },
  { label: 'xcolor', description: 'Color support', install: 'xcolor' },
  { label: 'tikz', description: 'Diagrams and vector graphics', install: 'pgf' },
  { label: 'caption', description: 'Caption formatting', install: 'caption' },
  { label: 'subcaption', description: 'Subfigures and subcaptions', install: 'caption' },
  { label: 'enumitem', description: 'List formatting', install: 'enumitem' },
  { label: 'siunitx', description: 'SI units and numeric formatting', install: 'siunitx' },
  { label: 'biblatex', description: 'Bibliography management', install: 'biblatex' },
  { label: 'cite', description: 'Compressed numeric citations', install: 'cite' },
  { label: 'listings', description: 'Code listings', install: 'listings' },
  { label: 'minted', description: 'Highlighted code blocks', install: 'minted' },
  { label: 'ctex', description: 'Chinese document classes and support', install: 'ctex' },
  { label: 'xeCJK', description: 'CJK typesetting with XeLaTeX', install: 'xecjk' },
  { label: 'fontspec', description: 'System font selection', install: 'fontspec' }
];
const COMMON_ENVIRONMENTS = [
  'abstract', 'align', 'cases', 'center', 'description', 'enumerate', 'equation',
  'figure', 'frame', 'itemize', 'matrix', 'pmatrix', 'proof', 'split', 'table',
  'tabular', 'theorem', 'verbatim'
];
const COMMON_COMMANDS = [
  { label: '\\section{}', insert: '\\section{$1}', detail: 'Section heading' },
  { label: '\\subsection{}', insert: '\\subsection{$1}', detail: 'Subsection heading' },
  { label: '\\includegraphics{}', insert: '\\includegraphics[width=${1:0.8}\\linewidth]{${2:figures/image.png}}', detail: 'Insert image' },
  { label: '\\caption{}', insert: '\\caption{$1}', detail: 'Caption' },
  { label: '\\label{}', insert: '\\label{${1:fig:label}}', detail: 'Label' },
  { label: '\\ref{}', insert: '\\ref{${1:label}}', detail: 'Reference' },
  { label: '\\cite{}', insert: '\\cite{${1:key}}', detail: 'Citation' },
  { label: '\\textbf{}', insert: '\\textbf{$1}', detail: 'Bold text' },
  { label: '\\emph{}', insert: '\\emph{$1}', detail: 'Emphasis' },
  { label: '\\begin{}', insert: '\\begin{${1:environment}}\n  $0\n\\end{$1}', detail: 'Environment block' }
];
const PROJECT_TEMPLATES = [
  {
    id: 'article-cn',
    label: '中文 Article',
    description: 'ctexart, figures, math, tables',
    files: () => ({
      'main.tex': defaultMainTex(),
      'README.md': '# 中文 Article\n\nStart writing in `main.tex`.\n'
    })
  },
  {
    id: 'article-en',
    label: 'English Article',
    description: 'article, figures, math, tables, hyperref',
    files: () => ({
      'main.tex': englishArticleTex(),
      'README.md': '# English Article\n\nStart writing in `main.tex`.\n'
    })
  },
  {
    id: 'beamer-cn',
    label: '中文 Beamer',
    description: 'ctexbeamer slides',
    files: () => ({
      'main.tex': beamerTex(),
      'README.md': '# 中文 Beamer\n\nEdit `main.tex` and build the slides.\n'
    })
  },
  {
    id: 'thesis-cn',
    label: '中文 Thesis Skeleton',
    description: 'chapters, references, figures',
    files: () => ({
      'main.tex': thesisTex(),
      'chapters/intro.tex': '\\section{研究背景}\n\n在这里写绪论内容。\n',
      'chapters/method.tex': '\\section{方法}\n\n在这里写方法内容。\n',
      'refs.bib': '@article{example2026,\n  title={Example Paper},\n  author={Author, A.},\n  journal={Journal},\n  year={2026}\n}\n',
      'README.md': '# 中文 Thesis Skeleton\n\nChapters are under `chapters/`.\n'
    })
  },
  {
    id: 'ieee-paper',
    label: 'IEEE-style Paper',
    description: 'Two-column article skeleton',
    files: () => ({
      'main.tex': ieeeLikeTex(),
      'refs.bib': '@inproceedings{example2026,\n  title={Example Conference Paper},\n  author={Author, A.},\n  booktitle={Proceedings},\n  year={2026}\n}\n',
      'README.md': '# IEEE-style Paper\n\nA lightweight two-column paper skeleton.\n'
    })
  }
];
let output;
let galleryProvider;
let dashboardProvider;
let extensionUri;
let previewPanel;
let isBuilding = false;
let queuedBuildOptions = null;
let suppressAutoBuildOnSave = 0;
let forwardSyncTimer = undefined;

function activate(context) {
  extensionUri = context.extensionUri;
  output = vscode.window.createOutputChannel('Local LaTeX');
  dashboardProvider = new DashboardProvider();
  galleryProvider = new GalleryProvider(context.extensionUri);
  context.subscriptions.push(output);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('localLatexWorkbench', dashboardProvider));
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('localLatexGallery', galleryProvider));

  context.subscriptions.push(vscode.commands.registerCommand('localLatex.newProject', newProjectFromTemplate));
  context.subscriptions.push(vscode.commands.registerCommand('localLatex.importTex', importTexFile));
  context.subscriptions.push(vscode.commands.registerCommand('localLatex.importProjectZip', importProjectZip));
  context.subscriptions.push(vscode.commands.registerCommand('localLatex.exportProjectZip', exportProjectZip));
  context.subscriptions.push(vscode.commands.registerCommand('localLatex.exportPdf', exportPdf));
  context.subscriptions.push(vscode.commands.registerCommand('localLatex.initWorkspace', initWorkspace));
  context.subscriptions.push(vscode.commands.registerCommand('localLatex.addPackage', addCommonPackage));
  context.subscriptions.push(vscode.commands.registerCommand('localLatex.installPackage', installPackage));
  context.subscriptions.push(vscode.commands.registerCommand('localLatex.ensureCommonPackages', ensurePackagesUsedByMainFile));
  context.subscriptions.push(vscode.commands.registerCommand('localLatex.build', buildMainFile));
  context.subscriptions.push(vscode.commands.registerCommand('localLatex.openPreview', openPreview));
  context.subscriptions.push(vscode.commands.registerCommand('localLatex.openPdf', openPdf));
  context.subscriptions.push(vscode.commands.registerCommand('localLatex.clean', cleanOutput));
  context.subscriptions.push(vscode.commands.registerCommand('localLatex.insertImage', pickAndInsertImage));
  context.subscriptions.push(vscode.commands.registerCommand('localLatex.pasteClipboardImage', pasteClipboardImage));
  context.subscriptions.push(vscode.commands.registerCommand('localLatex.refreshGallery', () => galleryProvider.refresh()));

  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((document) => {
    const config = getConfig();
    if (suppressAutoBuildOnSave > 0 || !config.get('autoBuildOnSave') || document.languageId !== 'latex') {
      return;
    }
    buildMainFile({ silent: true }).catch((error) => showError(error));
  }));
  context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection((event) => {
    scheduleSourceSyncToPdf(event);
  }));

  context.subscriptions.push(vscode.languages.registerCompletionItemProvider(
    { language: 'latex', scheme: 'file' },
    new LatexCompletionProvider(),
    '\\',
    '{',
    ','
  ));
}

function deactivate() {}

function getRoot() {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('Open a workspace folder before using Local LaTeX.');
  }
  return folder.uri.fsPath;
}

function getConfig() {
  return vscode.workspace.getConfiguration('localLatex');
}

function getPaths() {
  const root = getRoot();
  const config = getConfig();
  return {
    root,
    mainFile: path.join(root, config.get('mainFile', 'main.tex')),
    outputDir: path.join(root, config.get('outputDir', 'build')),
    figuresDir: path.join(root, config.get('figuresDir', 'figures'))
  };
}

async function newProjectFromTemplate(templateId) {
  let template = PROJECT_TEMPLATES.find((candidate) => candidate.id === templateId);
  if (!template) {
    const picked = await vscode.window.showQuickPick(PROJECT_TEMPLATES.map((candidate) => ({
      label: candidate.label,
      description: candidate.description,
      template: candidate
    })), {
      title: 'Choose a LaTeX project template'
    });
    if (!picked) {
      return;
    }
    template = picked.template;
  }

  const parent = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Choose parent folder'
  });
  if (!parent?.[0]) {
    return;
  }

  const projectName = await vscode.window.showInputBox({
    title: 'Project folder name',
    prompt: 'A new folder will be created under the selected parent folder.',
    value: template.id
  });
  if (!projectName) {
    return;
  }

  const targetRoot = path.join(parent[0].fsPath, sanitizePathName(projectName));
  if (fs.existsSync(targetRoot) && fs.readdirSync(targetRoot).length > 0) {
    throw new Error(`Target folder already exists and is not empty: ${targetRoot}`);
  }
  await writeProjectTemplate(targetRoot, template);
  const open = await vscode.window.showInformationMessage(`Created LaTeX project: ${targetRoot}`, 'Open Folder');
  if (open === 'Open Folder') {
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetRoot));
  }
}

async function writeProjectTemplate(targetRoot, template) {
  await fsp.mkdir(path.join(targetRoot, 'figures'), { recursive: true });
  await fsp.mkdir(path.join(targetRoot, 'build'), { recursive: true });
  await ensureGitKeep(path.join(targetRoot, 'figures'));
  await writeTextFile(path.join(targetRoot, '.gitignore'), defaultGitignore());
  await writeTextFile(path.join(targetRoot, '.vscode', 'settings.json'), JSON.stringify(defaultWorkspaceSettings(), null, 2));
  await writeTextFile(path.join(targetRoot, '.vscode', 'extensions.json'), JSON.stringify(defaultWorkspaceExtensions(), null, 2));

  const files = template.files();
  for (const [relativePath, content] of Object.entries(files)) {
    await writeTextFile(path.join(targetRoot, relativePath), content);
  }
}

async function writeTextFile(filePath, content) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, content, 'utf8');
}

async function importProjectZip() {
  const pickedZip = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      'ZIP archives': ['zip']
    },
    openLabel: 'Import ZIP'
  });
  if (!pickedZip?.[0]) {
    return;
  }

  const parent = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Choose import parent folder'
  });
  if (!parent?.[0]) {
    return;
  }

  const defaultName = sanitizePathName(path.basename(pickedZip[0].fsPath, path.extname(pickedZip[0].fsPath)));
  const projectName = await vscode.window.showInputBox({
    title: 'Imported project folder name',
    value: defaultName
  });
  if (!projectName) {
    return;
  }

  const targetRoot = path.join(parent[0].fsPath, sanitizePathName(projectName));
  if (fs.existsSync(targetRoot) && fs.readdirSync(targetRoot).length > 0) {
    throw new Error(`Target folder already exists and is not empty: ${targetRoot}`);
  }
  await fsp.mkdir(targetRoot, { recursive: true });
  await runPowerShell('Expand-Archive -LiteralPath $env:LOCAL_LATEX_ZIP -DestinationPath $env:LOCAL_LATEX_DEST -Force', {
    LOCAL_LATEX_ZIP: pickedZip[0].fsPath,
    LOCAL_LATEX_DEST: targetRoot
  });
  const open = await vscode.window.showInformationMessage(`Imported LaTeX project: ${targetRoot}`, 'Open Folder');
  if (open === 'Open Folder') {
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetRoot));
  }
}

async function importTexFile() {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      'LaTeX files': ['tex']
    },
    openLabel: '导入 TeX'
  });
  if (!picked?.[0]) {
    return;
  }

  const source = picked[0].fsPath;
  const { root, mainFile, figuresDir, outputDir } = getPaths();
  await fsp.mkdir(figuresDir, { recursive: true });
  await fsp.mkdir(outputDir, { recursive: true });
  await ensureGitKeep(figuresDir);
  await writeWorkspaceDefaults(root);

  let target = mainFile;
  const sameAsConfiguredMain = samePath(source, target);
  if (fs.existsSync(target) && !sameAsConfiguredMain) {
    const choice = await vscode.window.showWarningMessage(
      `当前项目已有 ${path.basename(mainFile)}，导入的 .tex 要怎么处理？`,
      '覆盖主文件',
      '保留原文件名',
      '取消'
    );
    if (!choice || choice === '取消') {
      return;
    }
    if (choice === '保留原文件名') {
      target = await uniquePath(path.join(root, sanitizePathName(path.basename(source))));
    }
  }

  if (!samePath(source, target)) {
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.copyFile(source, target);
  }

  const mainRelative = path.relative(root, target).replace(/\\/g, '/');
  await getConfig().update('mainFile', mainRelative, vscode.ConfigurationTarget.Workspace);
  const doc = await vscode.workspace.openTextDocument(target);
  await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
  dashboardProvider.refresh();
  galleryProvider.refresh();

  const next = await vscode.window.showInformationMessage(`已导入 TeX 文件：${mainRelative}`, '编译预览');
  if (next === '编译预览') {
    await buildMainFile({ silent: false });
  }
}

async function exportProjectZip() {
  const { root } = getPaths();
  const includeBuild = await vscode.window.showQuickPick([
    {
      label: 'Source only',
      description: 'Recommended: excludes build output, .git, node_modules, and VSIX files',
      value: false
    },
    {
      label: 'Include build output',
      description: 'Includes the configured build directory and generated PDF',
      value: true
    }
  ], {
    title: 'Export project ZIP'
  });
  if (!includeBuild) {
    return;
  }

  const defaultUri = vscode.Uri.file(path.join(path.dirname(root), `${path.basename(root)}.zip`));
  const target = await vscode.window.showSaveDialog({
    defaultUri,
    filters: {
      'ZIP archives': ['zip']
    },
    saveLabel: 'Export Project'
  });
  if (!target) {
    return;
  }

  const stage = path.join(os.tmpdir(), `local-latex-export-${Date.now()}`);
  try {
    await copyProjectForExport(root, stage, includeBuild.value);
    await fsp.rm(target.fsPath, { force: true });
    await runPowerShell('$items = Get-ChildItem -LiteralPath $env:LOCAL_LATEX_STAGE -Force; if ($items.Count -eq 0) { throw "Nothing to export." }; $items | Compress-Archive -DestinationPath $env:LOCAL_LATEX_ZIP -Force', {
      LOCAL_LATEX_STAGE: stage,
      LOCAL_LATEX_ZIP: target.fsPath
    });
  } finally {
    await fsp.rm(stage, { recursive: true, force: true });
  }
  vscode.window.showInformationMessage(`Exported project ZIP: ${target.fsPath}`);
}

async function exportPdf() {
  const pdf = getPdfPath();
  if (!fs.existsSync(pdf)) {
    await buildMainFile({ silent: false });
  }
  if (!fs.existsSync(pdf)) {
    throw new Error(`PDF was not generated: ${pdf}`);
  }

  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(path.dirname(getRoot()), path.basename(pdf))),
    filters: {
      PDF: ['pdf']
    },
    saveLabel: 'Export PDF'
  });
  if (!target) {
    return;
  }
  await fsp.copyFile(pdf, target.fsPath);
  vscode.window.showInformationMessage(`Exported PDF: ${target.fsPath}`);
}

async function copyProjectForExport(sourceRoot, targetRoot, includeBuild) {
  const outputDirName = getConfig().get('outputDir', 'build');
  await copyDirFiltered(sourceRoot, targetRoot, (relativePath, entry) => {
    if (!relativePath) {
      return true;
    }
    const parts = relativePath.split(/[\\/]+/);
    if (parts.includes('.git') || parts.includes('node_modules')) {
      return false;
    }
    if (!includeBuild && parts[0] === outputDirName) {
      return false;
    }
    if (entry.isFile()) {
      const lower = entry.name.toLowerCase();
      if (lower.endsWith('.vsix')) {
        return false;
      }
      if (!includeBuild && /\.(aux|bbl|bcf|blg|fdb_latexmk|fls|log|out|run\.xml|synctex\.gz|toc)$/i.test(lower)) {
        return false;
      }
    }
    return true;
  });
}

async function copyDirFiltered(source, target, shouldCopy, relativePath = '') {
  const entry = await fsp.lstat(source);
  if (!shouldCopy(relativePath, {
    isFile: () => entry.isFile(),
    isDirectory: () => entry.isDirectory(),
    name: path.basename(source)
  })) {
    return;
  }
  if (entry.isDirectory()) {
    await fsp.mkdir(target, { recursive: true });
    const children = await fsp.readdir(source);
    for (const child of children) {
      await copyDirFiltered(
        path.join(source, child),
        path.join(target, child),
        shouldCopy,
        relativePath ? path.join(relativePath, child) : child
      );
    }
    return;
  }
  if (entry.isFile()) {
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.copyFile(source, target);
  }
}

async function initWorkspace() {
  const { root, mainFile, figuresDir, outputDir } = getPaths();
  await fsp.mkdir(figuresDir, { recursive: true });
  await fsp.mkdir(outputDir, { recursive: true });
  if (!fs.existsSync(mainFile)) {
    await fsp.writeFile(mainFile, defaultMainTex(), 'utf8');
  }
  await ensureGitKeep(figuresDir);
  await writeWorkspaceDefaults(root);
  galleryProvider.refresh();
  vscode.window.showInformationMessage(`Local LaTeX workspace initialized: ${root}`);
}

async function writeWorkspaceDefaults(root) {
  const vscodeDir = path.join(root, '.vscode');
  await fsp.mkdir(vscodeDir, { recursive: true });
  const extensionsPath = path.join(vscodeDir, 'extensions.json');
  if (!fs.existsSync(extensionsPath)) {
    await writeTextFile(extensionsPath, JSON.stringify(defaultWorkspaceExtensions(), null, 2));
  }
  const settingsPath = path.join(vscodeDir, 'settings.json');
  if (!fs.existsSync(settingsPath)) {
    await writeTextFile(settingsPath, JSON.stringify(defaultWorkspaceSettings(), null, 2));
  } else {
    await mergeWorkspaceDefaults(settingsPath, defaultWorkspaceSettings());
  }
  const gitignorePath = path.join(root, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    await writeTextFile(gitignorePath, defaultGitignore());
  }
}

async function mergeWorkspaceDefaults(settingsPath, defaults) {
  let settings;
  try {
    settings = JSON.parse(await fsp.readFile(settingsPath, 'utf8'));
  } catch {
    return;
  }
  let changed = false;
  for (const [key, value] of Object.entries(defaults)) {
    if (key === 'files.associations') {
      settings[key] = settings[key] && typeof settings[key] === 'object' ? settings[key] : {};
      for (const [pattern, language] of Object.entries(value)) {
        if (settings[key][pattern] === undefined) {
          settings[key][pattern] = language;
          changed = true;
        }
      }
    } else if (settings[key] === undefined) {
      settings[key] = value;
      changed = true;
    }
  }
  if (changed) {
    await writeTextFile(settingsPath, JSON.stringify(settings, null, 2));
  }
}

async function ensureGitKeep(dir) {
  const gitkeep = path.join(dir, '.gitkeep');
  if (!fs.existsSync(gitkeep)) {
    await fsp.writeFile(gitkeep, '', 'utf8');
  }
}

async function buildMainFile(options = {}) {
  if (isBuilding) {
    queuedBuildOptions = mergeBuildOptions(queuedBuildOptions, options);
    return;
  }
  isBuilding = true;
  const { root, mainFile, outputDir } = getPaths();
  try {
    if (!fs.existsSync(mainFile)) {
      throw new Error(`Main file not found: ${mainFile}`);
    }
    await writeWorkspaceDefaults(root);
    await saveDirtyLatexDocuments(root);
    await fsp.mkdir(outputDir, { recursive: true });
    const engine = await findEngine();
    const args = [
      '--miktex-disable-installer',
      '-synctex=1',
      '-interaction=nonstopmode',
      '-halt-on-error',
      '-file-line-error',
      `-output-directory=${path.relative(root, outputDir)}`,
      path.relative(root, mainFile)
    ];

    output.clear();
    if (!options.silent) {
      output.show(true);
    }
    output.appendLine(`Using engine: ${engine}`);
    await run(engine, args, root);
    await run(engine, args, root);
    if (!options.silent) {
      vscode.window.showInformationMessage('LaTeX build complete.');
    }
    galleryProvider.refresh();
    if (getConfig().get('openPreviewAfterBuild', true)) {
      await openPdfPreview({ preserveFocus: true });
    } else {
      await refreshPreview();
    }
  } finally {
    isBuilding = false;
    const nextBuild = queuedBuildOptions;
    queuedBuildOptions = null;
    if (nextBuild) {
      await buildMainFile(nextBuild);
    }
  }
}

function mergeBuildOptions(previous, next) {
  if (!previous) {
    return { ...next };
  }
  return {
    ...previous,
    ...next,
    silent: Boolean(previous.silent) && Boolean(next.silent)
  };
}

async function saveDirtyLatexDocuments(root) {
  const dirtyLatexDocs = vscode.workspace.textDocuments.filter((document) => {
    if (!document.isDirty || document.uri.scheme !== 'file') {
      return false;
    }
    const file = document.uri.fsPath;
    const ext = path.extname(file).toLowerCase();
    return isPathInside(root, file) && (document.languageId === 'latex' || ext === '.tex');
  });
  if (!dirtyLatexDocs.length) {
    return;
  }
  suppressAutoBuildOnSave += 1;
  try {
    for (const document of dirtyLatexDocs) {
      await document.save();
    }
  } finally {
    suppressAutoBuildOnSave -= 1;
  }
}

async function openPreview() {
  const pdf = getPdfPath();
  if (!fs.existsSync(pdf)) {
    await buildMainFile({ silent: false });
    return;
  }
  await openPdfPreview({ preserveFocus: false });
}

async function openPdf() {
  const pdf = getPdfPath();
  if (!fs.existsSync(pdf)) {
    await buildMainFile();
  }
  await openPdfDocument(pdf, { viewColumn: vscode.ViewColumn.Active, preserveFocus: false });
}

function getPdfPath() {
  const { mainFile, outputDir } = getPaths();
  const stem = path.basename(mainFile, path.extname(mainFile));
  return path.join(outputDir, `${stem}.pdf`);
}

function scheduleSourceSyncToPdf(event) {
  const config = getConfig();
  const document = event.textEditor?.document;
  const position = event.selections?.[0]?.active;
  if (!previewPanel || !config.get('forwardSyncOnCursor', true) || !document || !position) {
    return;
  }
  if (document.uri.scheme !== 'file') {
    return;
  }
  const file = document.uri.fsPath;
  const ext = path.extname(file).toLowerCase();
  if (document.languageId !== 'latex' && ext !== '.tex') {
    return;
  }
  const { root } = getPaths();
  if (!isPathInsideOrEqual(root, file)) {
    return;
  }
  clearTimeout(forwardSyncTimer);
  forwardSyncTimer = setTimeout(() => {
    syncSourcePositionToPdf(document, position).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      output?.appendLine(message);
      previewPanel?.webview.postMessage({ command: 'syncStatus', level: 'error', message });
    });
  }, 250);
}

async function openPdfPreview(options = {}) {
  const pdf = getPdfPath();
  if (!fs.existsSync(pdf)) {
    return;
  }
  if (!previewPanel) {
    previewPanel = vscode.window.createWebviewPanel(
      'localLatexPreview',
      'LaTeX Preview',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.file(getRoot()), extensionUri],
        retainContextWhenHidden: true
      }
    );
    previewPanel.onDidDispose(() => {
      previewPanel = undefined;
    });
    previewPanel.webview.onDidReceiveMessage(async (message) => {
      try {
        if (message.command === 'build') {
          await buildMainFile();
        } else if (message.command === 'openPdf') {
          await openPdf();
        } else if (message.command === 'exportPdf') {
          await exportPdf();
        } else if (message.command === 'syncToSource') {
          const target = await syncPdfPointToSource(message);
          previewPanel?.webview.postMessage({
            command: 'syncStatus',
            level: 'ok',
            message: `已跳转到 ${path.basename(target.file)}:${target.line}`
          });
        }
      } catch (error) {
        if (message.command === 'syncToSource') {
          const messageText = error instanceof Error ? error.message : String(error);
          output?.appendLine(messageText);
          previewPanel?.webview.postMessage({ command: 'syncStatus', level: 'error', message: messageText });
        } else {
          showError(error);
        }
      }
    });
  }
  previewPanel.webview.html = previewHtml(previewPanel.webview, pdf);
  previewPanel.reveal(vscode.ViewColumn.Beside, options.preserveFocus ?? false);
}

async function refreshPreview() {
  if (!previewPanel) {
    return;
  }
  const pdf = getPdfPath();
  if (fs.existsSync(pdf)) {
    previewPanel.webview.html = previewHtml(previewPanel.webview, pdf);
  }
}

async function openPdfDocument(pdfPath, options = {}) {
  const uri = vscode.Uri.file(pdfPath);
  const viewColumn = options.viewColumn ?? vscode.ViewColumn.Beside;
  const preserveFocus = options.preserveFocus ?? false;
  const openOptions = { viewColumn, preview: false, preserveFocus };
  await vscode.commands.executeCommand('vscode.open', uri, openOptions);
}

async function syncPdfPointToSource(point) {
  const { root, outputDir } = getPaths();
  const pdf = getPdfPath();
  if (!fs.existsSync(pdf)) {
    throw new Error('PDF not found. Build the project first.');
  }
  const synctexPath = getSynctexPath(pdf);
  if (!fs.existsSync(synctexPath) && !fs.existsSync(`${synctexPath}.gz`)) {
    throw new Error('SyncTeX file not found. Build once with SyncTeX enabled.');
  }
  const page = Number(point.page);
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(page) || !Number.isFinite(x) || !Number.isFinite(y) || page < 1) {
    throw new Error('Invalid PDF click location.');
  }
  const synctex = await findSynctex();
  const query = `${Math.floor(page)}:${x.toFixed(2)}:${y.toFixed(2)}:${pdf}`;
  output.appendLine(`\n> ${synctex} edit -o ${query} -d ${outputDir}`);
  const result = await runCapture(synctex, ['edit', '-o', query, '-d', outputDir], root);
  output.append(result);
  const target = parseSynctexEditResult(result, root);
  await revealSourceLocation(target.file, target.line, target.column);
  return target;
}

async function syncSourcePositionToPdf(document, position) {
  const { root, outputDir } = getPaths();
  const pdf = getPdfPath();
  if (!fs.existsSync(pdf)) {
    return;
  }
  const synctexPath = getSynctexPath(pdf);
  if (!fs.existsSync(synctexPath) && !fs.existsSync(`${synctexPath}.gz`)) {
    return;
  }
  const synctex = await findSynctex();
  const input = normalizeSynctexPath(document.uri.fsPath);
  const outputPdf = normalizeSynctexPath(pdf);
  const outputDirectory = normalizeSynctexPath(outputDir);
  const query = `${position.line + 1}:${position.character + 1}:${input}`;
  output.appendLine(`\n> ${synctex} view -i ${query} -o ${outputPdf} -d ${outputDirectory}`);
  const result = await runCapture(synctex, ['view', '-i', query, '-o', outputPdf, '-d', outputDirectory], root);
  output.append(result);
  const target = parseSynctexViewResult(result);
  previewPanel?.reveal(vscode.ViewColumn.Beside, true);
  previewPanel?.webview.postMessage({
    command: 'syncToPdf',
    page: target.page,
    x: target.x,
    y: target.y,
    sourceLine: position.line + 1
  });
}

function getSynctexPath(pdfPath) {
  return path.join(path.dirname(pdfPath), `${path.basename(pdfPath, path.extname(pdfPath))}.synctex`);
}

async function findSynctex() {
  const engine = await findEngine();
  const exeName = process.platform === 'win32' ? 'synctex.exe' : 'synctex';
  const sibling = path.join(path.dirname(engine), exeName);
  if (fs.existsSync(sibling)) {
    return sibling;
  }
  const resolved = await where('synctex');
  if (resolved) {
    return resolved;
  }
  throw new Error('Could not find synctex. Install MiKTeX/TeX Live SyncTeX tools or add synctex to PATH.');
}

function parseSynctexEditResult(result, root) {
  const records = result.split(/SyncTeX result begin/g).slice(1);
  for (const record of records) {
    const input = matchSynctexField(record, 'Input');
    const line = Number(matchSynctexField(record, 'Line'));
    const column = Number(matchSynctexField(record, 'Column'));
    if (!input || !Number.isFinite(line) || line < 1) {
      continue;
    }
    const file = path.isAbsolute(input) ? input : path.resolve(root, input);
    return {
      file,
      line,
      column: Number.isFinite(column) && column > 0 ? column : 1
    };
  }
  throw new Error('SyncTeX did not return a source location for this PDF point.');
}

function parseSynctexViewResult(result) {
  const records = result.split(/SyncTeX result begin/g).slice(1);
  for (const record of records) {
    const page = Number(matchSynctexField(record, 'Page'));
    const x = Number(matchSynctexField(record, 'x') || matchSynctexField(record, 'h'));
    const y = Number(matchSynctexField(record, 'y') || matchSynctexField(record, 'v'));
    if (Number.isFinite(page) && page >= 1 && Number.isFinite(x) && Number.isFinite(y)) {
      return { page, x, y };
    }
  }
  throw new Error('SyncTeX did not return a PDF location for this source line.');
}

function matchSynctexField(record, field) {
  const match = record.match(new RegExp(`^${field}:(.*)$`, 'm'));
  return match ? match[1].trim() : '';
}

function normalizeSynctexPath(file) {
  return path.resolve(file).replace(/\\/g, '/');
}

async function revealSourceLocation(file, line, column) {
  if (!fs.existsSync(file)) {
    throw new Error(`SyncTeX source file not found: ${file}`);
  }
  const doc = await vscode.workspace.openTextDocument(file);
  const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false);
  const position = new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1));
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}

async function cleanOutput() {
  const { outputDir } = getPaths();
  await fsp.rm(outputDir, { recursive: true, force: true });
  vscode.window.showInformationMessage('LaTeX build output cleaned.');
}

async function addCommonPackage(packageName) {
  let pkg = COMMON_PACKAGES.find((candidate) => candidate.label === packageName || candidate.install === packageName);
  if (!pkg) {
    const picked = await vscode.window.showQuickPick(COMMON_PACKAGES.map((candidate) => ({
      label: candidate.label,
      description: candidate.description,
      pkg: candidate
    })), {
      title: 'Add common LaTeX package'
    });
    if (!picked) {
      return;
    }
    pkg = picked.pkg;
  }
  await insertUsePackage(pkg.label);
}

async function insertUsePackage(packageName) {
  let editor = vscode.window.activeTextEditor;
  const { mainFile } = getPaths();
  if (!editor || editor.document.languageId !== 'latex') {
    const doc = await vscode.workspace.openTextDocument(mainFile);
    editor = await vscode.window.showTextDocument(doc);
  }

  const text = editor.document.getText();
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`\\\\usepackage(?:\\[[^\\]]*\\])?\\{[^}]*\\b${escaped}\\b[^}]*\\}`).test(text)) {
    vscode.window.showInformationMessage(`Package already present: ${packageName}`);
    return;
  }

  const line = `\\usepackage{${packageName}}\n`;
  const lines = text.split(/\r?\n/);
  let insertLine = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\\usepackage/.test(lines[i])) {
      insertLine = i + 1;
    } else if (insertLine === 0 && /^\\documentclass/.test(lines[i])) {
      insertLine = i + 1;
    }
  }
  await editor.edit((edit) => edit.insert(new vscode.Position(insertLine, 0), line));
  vscode.window.showInformationMessage(`Inserted \\usepackage{${packageName}}`);
}

async function installPackage(packageName) {
  let name = packageName;
  if (!name) {
    const picked = await vscode.window.showQuickPick([
      ...COMMON_PACKAGES.map((pkg) => ({
        label: pkg.label,
        description: `MiKTeX package: ${pkg.install}`,
        pkg
      })),
      { label: 'Custom package name...', description: 'Type a MiKTeX package name', custom: true }
    ], {
      title: 'Install MiKTeX package'
    });
    if (!picked) {
      return;
    }
    if (picked.custom) {
      name = await vscode.window.showInputBox({
        title: 'MiKTeX package name',
        prompt: 'Example: hyperref, ctex, pgf, biblatex'
      });
    } else {
      name = picked.pkg.install || picked.pkg.label;
    }
  }
  if (!name) {
    return;
  }

  const mpm = await findMpm();
  output.show(true);
  output.appendLine(`Installing MiKTeX package: ${name}`);
  await run(mpm, ['--verbose', `--install=${name}`], getRoot());
  vscode.window.showInformationMessage(`MiKTeX package installed or already available: ${name}`);
}

async function ensurePackagesUsedByMainFile() {
  const { mainFile } = getPaths();
  if (!fs.existsSync(mainFile)) {
    throw new Error(`Main file not found: ${mainFile}`);
  }
  const text = await fsp.readFile(mainFile, 'utf8');
  const packageNames = parseUsePackages(text);
  if (packageNames.length === 0) {
    vscode.window.showInformationMessage('No \\usepackage entries found in the main file.');
    return;
  }
  const selected = await vscode.window.showQuickPick(packageNames.map((name) => ({
    label: name,
    picked: true
  })), {
    canPickMany: true,
    title: 'Install packages used by main file'
  });
  if (!selected || selected.length === 0) {
    return;
  }
  const mpm = await findMpm();
  output.show(true);
  for (const item of selected) {
    const installName = packageInstallName(item.label);
    output.appendLine(`Installing MiKTeX package: ${installName}`);
    await run(mpm, ['--verbose', `--install=${installName}`], getRoot());
  }
  vscode.window.showInformationMessage('Selected MiKTeX packages installed or already available.');
}

function parseUsePackages(text) {
  const names = new Set();
  const regex = /\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g;
  let match;
  while ((match = regex.exec(text))) {
    match[1].split(',').map((name) => name.trim()).filter(Boolean).forEach((name) => names.add(name));
  }
  return Array.from(names).sort();
}

function packageInstallName(packageName) {
  return COMMON_PACKAGES.find((pkg) => pkg.label.toLowerCase() === packageName.toLowerCase())?.install || packageName;
}

async function pickAndInsertImage() {
  const uri = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: {
      Images: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'pdf']
    }
  });
  if (!uri?.[0]) {
    return;
  }
  const saved = await copyImageIntoFigures(uri[0].fsPath);
  await insertFigureBlock(saved);
}

async function pasteClipboardImage() {
  if (process.platform !== 'win32') {
    throw new Error('Clipboard image paste is currently implemented for Windows PowerShell.');
  }
  const { figuresDir } = getPaths();
  await fsp.mkdir(figuresDir, { recursive: true });
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$img = [System.Windows.Forms.Clipboard]::GetImage()
if ($null -eq $img) { exit 2 }
$dir = $env:LOCAL_LATEX_FIGURES
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$file = Join-Path $dir ('fig-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.png')
$img.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output $file
`;
  const result = await runCapture('powershell.exe', [
    '-NoProfile',
    '-STA',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script
  ], getRoot(), { LOCAL_LATEX_FIGURES: figuresDir });

  const imagePath = result.trim();
  if (!imagePath) {
    throw new Error('Clipboard does not contain an image.');
  }
  await insertFigureBlock(imagePath);
  galleryProvider.refresh();
}

async function copyImageIntoFigures(sourcePath) {
  const { figuresDir } = getPaths();
  await fsp.mkdir(figuresDir, { recursive: true });
  const ext = path.extname(sourcePath).toLowerCase();
  if (!imageExts.has(ext)) {
    throw new Error(`Unsupported image type: ${ext}`);
  }
  const base = sanitizeName(path.basename(sourcePath, ext));
  const target = await uniquePath(path.join(figuresDir, `${base}${ext}`));
  if (path.resolve(sourcePath) !== path.resolve(target)) {
    await fsp.copyFile(sourcePath, target);
  }
  galleryProvider.refresh();
  return target;
}

async function saveDataUrlImage(name, dataUrl) {
  const { figuresDir } = getPaths();
  await fsp.mkdir(figuresDir, { recursive: true });
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error('Invalid image data.');
  }
  const ext = mimeToExt(match[1]) || path.extname(name).toLowerCase() || '.png';
  const target = await uniquePath(path.join(figuresDir, `${sanitizeName(path.basename(name, path.extname(name)))}${ext}`));
  await fsp.writeFile(target, Buffer.from(match[2], 'base64'));
  galleryProvider.refresh();
  return target;
}

async function insertFigureBlock(imagePath) {
  const { root, mainFile } = getPaths();
  const config = getConfig();
  const rel = path.relative(root, imagePath).replace(/\\/g, '/');
  const label = sanitizeLabel(path.basename(imagePath, path.extname(imagePath)));
  const width = config.get('figureWidth', '0.8');
  const block = [
    '\\begin{figure}[htbp]',
    '  \\centering',
    `  \\includegraphics[width=${width}\\linewidth]{${rel}}`,
    `  \\caption{${label}}`,
    `  \\label{fig:${label}}`,
    '\\end{figure}',
    ''
  ].join('\n');

  let editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'latex') {
    const doc = await vscode.workspace.openTextDocument(mainFile);
    editor = await vscode.window.showTextDocument(doc);
  }
  await editor.edit((edit) => {
    edit.insert(editor.selection.active, block);
  });
}

async function findEngine() {
  const configured = getConfig().get('enginePath', '');
  if (configured && fs.existsSync(configured)) {
    return configured;
  }

  const userProfile = process.env.USERPROFILE || '';
  const candidates = [
    path.join(userProfile, 'AppData', 'Local', 'Programs', 'MiKTeX', 'miktex', 'bin', 'x64', 'xelatex.exe'),
    'C:\\Program Files\\MiKTeX\\miktex\\bin\\x64\\xelatex.exe',
    'xelatex'
  ];
  for (const candidate of candidates) {
    if (candidate === 'xelatex') {
      const resolved = await where('xelatex');
      if (resolved) {
        return resolved;
      }
      continue;
    }
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('Could not find xelatex. Set localLatex.enginePath in VS Code settings.');
}

async function findMpm() {
  const engine = await findEngine();
  const localMpm = path.join(path.dirname(engine), 'mpm.exe');
  if (fs.existsSync(localMpm)) {
    return localMpm;
  }
  const resolved = await where('mpm');
  if (resolved) {
    return resolved;
  }
  throw new Error('Could not find MiKTeX package manager mpm.exe.');
}

async function where(command) {
  try {
    const bin = process.platform === 'win32' ? 'where.exe' : 'which';
    const result = await runCapture(bin, [command], getRoot());
    return result.split(/\r?\n/).find(Boolean);
  } catch {
    return '';
  }
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    output.appendLine(`\n> ${command} ${args.join(' ')}`);
    const child = execFile(command, args, { cwd, windowsHide: true }, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
    child.stdout?.on('data', (data) => output.append(data.toString()));
    child.stderr?.on('data', (data) => output.append(data.toString()));
  });
}

function runCapture(command, args, cwd, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd,
      windowsHide: true,
      env: { ...process.env, ...extraEnv }
    }, (error, stdout, stderr) => {
      if (error) {
        if (error.code === 2) {
          reject(new Error('Clipboard does not contain an image.'));
        } else {
          reject(new Error(stderr || error.message));
        }
      } else {
        resolve(stdout.toString());
      }
    });
  });
}

function runPowerShell(script, extraEnv = {}) {
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
  return runCapture('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script
  ], cwd, extraEnv);
}

function showError(error) {
  const message = error instanceof Error ? error.message : String(error);
  output?.appendLine(message);
  vscode.window.showErrorMessage(message);
}

function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
}

function sanitizePathName(name) {
  return name.trim().replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-').replace(/^-+|-+$/g, '') || 'latex-project';
}

function samePath(a, b) {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function isPathInside(root, file) {
  const relative = path.relative(root, file);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isPathInsideOrEqual(root, file) {
  return samePath(root, file) || isPathInside(root, file);
}

function sanitizeLabel(name) {
  return sanitizeName(name).replace(/\./g, '-').toLowerCase();
}

async function uniquePath(target) {
  const ext = path.extname(target);
  const stem = target.slice(0, -ext.length);
  let candidate = target;
  let i = 1;
  while (fs.existsSync(candidate)) {
    candidate = `${stem}-${i}${ext}`;
    i += 1;
  }
  return candidate;
}

function mimeToExt(mime) {
  const map = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/bmp': '.bmp',
    'image/webp': '.webp'
  };
  return map[mime] || '';
}

function listImages(root, figuresDir) {
  if (!fs.existsSync(figuresDir)) {
    return [];
  }
  return fs.readdirSync(figuresDir)
    .filter((file) => imageExts.has(path.extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => {
      const fullPath = path.join(figuresDir, file);
      const ext = path.extname(file).toLowerCase();
      let size = 0;
      try {
        size = fs.statSync(fullPath).size;
      } catch {
        size = 0;
      }
      return {
        name: file,
        ext,
        size,
        fullPath,
        rel: path.relative(root, fullPath).replace(/\\/g, '/')
      };
    });
}

class LatexCompletionProvider {
  provideCompletionItems(document, position) {
    const prefix = document.lineAt(position).text.slice(0, position.character);
    if (/\\usepackage(?:\[[^\]]*\])?\{[^}]*$/.test(prefix)) {
      return COMMON_PACKAGES.map((pkg) => {
        const item = new vscode.CompletionItem(pkg.label, vscode.CompletionItemKind.Module);
        item.detail = pkg.description;
        item.insertText = pkg.label;
        return item;
      });
    }

    if (/\\(?:begin|end)\{[^}]*$/.test(prefix)) {
      return COMMON_ENVIRONMENTS.map((env) => {
        const item = new vscode.CompletionItem(env, vscode.CompletionItemKind.Class);
        item.detail = 'LaTeX environment';
        item.insertText = env;
        return item;
      });
    }

    const items = [];
    for (const command of COMMON_COMMANDS) {
      const item = new vscode.CompletionItem(command.label, vscode.CompletionItemKind.Function);
      item.detail = command.detail;
      item.insertText = new vscode.SnippetString(command.insert);
      items.push(item);
    }
    for (const env of COMMON_ENVIRONMENTS) {
      const item = new vscode.CompletionItem(`begin ${env}`, vscode.CompletionItemKind.Snippet);
      item.detail = `\\begin{${env}} block`;
      item.insertText = new vscode.SnippetString(`\\begin{${env}}\n  $0\n\\end{${env}}`);
      items.push(item);
    }
    return items;
  }
}

class DashboardProvider {
  constructor() {
    this.view = undefined;
  }

  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = {
      enableScripts: true
    };
    view.webview.onDidReceiveMessage(async (message) => {
      try {
        if (message.command === 'run') {
          await runDashboardAction(message.action, message.value);
        }
      } catch (error) {
        showError(error);
      }
    });
    this.refresh();
  }

  refresh() {
    if (!this.view) {
      return;
    }
    this.view.webview.html = dashboardHtml();
  }
}

async function runDashboardAction(action, value) {
  switch (action) {
    case 'newProject':
      await newProjectFromTemplate(value);
      break;
    case 'importTex':
      await importTexFile();
      break;
    case 'initWorkspace':
      await initWorkspace();
      break;
    case 'openPreview':
      await openPreview();
      break;
    case 'build':
      await buildMainFile();
      break;
    case 'openPdf':
      await openPdf();
      break;
    case 'exportPdf':
      await exportPdf();
      break;
    case 'exportZip':
      await exportProjectZip();
      break;
    case 'importZip':
      await importProjectZip();
      break;
    case 'addPackage':
      await addCommonPackage(value);
      break;
    case 'installPackage':
      await installPackage(value);
      break;
    case 'ensurePackages':
      await ensurePackagesUsedByMainFile();
      break;
    case 'insertImage':
      await pickAndInsertImage();
      break;
    case 'pasteImage':
      await pasteClipboardImage();
      break;
    case 'clean':
      await cleanOutput();
      break;
    default:
      throw new Error(`Unknown dashboard action: ${action}`);
  }
}

class GalleryProvider {
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
    this.view = undefined;
  }

  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(getRoot()), this.extensionUri]
    };
    view.webview.onDidReceiveMessage(async (message) => {
      try {
        if (message.command === 'insert') {
          await insertFigureBlock(message.path);
        } else if (message.command === 'open') {
          await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(message.path));
        } else if (message.command === 'addImage') {
          const saved = await saveDataUrlImage(message.name, message.dataUrl);
          await insertFigureBlock(saved);
        } else if (message.command === 'refresh') {
          this.refresh();
        }
      } catch (error) {
        showError(error);
      }
    });
    this.refresh();
  }

  refresh() {
    if (!this.view) {
      return;
    }
    const { root, figuresDir } = getPaths();
    const images = listImages(root, figuresDir).map((image) => ({
      ...image,
      src: this.view.webview.asWebviewUri(vscode.Uri.file(image.fullPath)).toString()
    }));
    this.view.webview.html = galleryHtml(images);
  }
}

function galleryHtml(images) {
  const nonce = Date.now().toString(36);
  const data = JSON.stringify(images).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root { color-scheme: dark light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 12px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    .shell { display: grid; gap: 12px; }
    .header { display: grid; gap: 3px; }
    .eyebrow { color: var(--vscode-descriptionForeground); font-size: 11px; text-transform: uppercase; }
    h1 { margin: 0; font-size: 15px; line-height: 1.25; font-weight: 650; }
    .toolbar { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    button {
      min-height: 30px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 6px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      padding: 6px 9px;
      cursor: pointer;
      font: inherit;
      text-align: center;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border-color: var(--vscode-panel-border);
    }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .drop {
      min-height: 106px;
      border: 1px dashed var(--vscode-panel-border);
      border-radius: 8px;
      padding: 14px 12px;
      display: grid;
      place-items: center;
      text-align: center;
      background: var(--vscode-editorWidget-background);
      transition: border-color 120ms ease, background 120ms ease;
    }
    .drop.active { border-color: var(--vscode-focusBorder); background: var(--vscode-list-hoverBackground); }
    .drop-title { display: block; margin-bottom: 5px; font-weight: 650; }
    .drop-copy { display: block; color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.4; }
    .count { color: var(--vscode-descriptionForeground); font-size: 12px; padding-top: 2px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 10px; }
    .card { border: 1px solid var(--vscode-panel-border); border-radius: 8px; overflow: hidden; background: var(--vscode-editorWidget-background); }
    .thumb { height: 96px; display: grid; place-items: center; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); }
    img { width: 100%; height: 96px; object-fit: contain; display: block; }
    .pdf-thumb { border: 1px solid var(--vscode-panel-border); border-radius: 5px; padding: 7px 10px; color: var(--vscode-descriptionForeground); font-weight: 650; }
    .body { padding: 8px; display: grid; gap: 7px; }
    .name { font-size: 12px; line-height: 1.3; overflow-wrap: anywhere; font-weight: 600; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 11px; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .actions button { min-height: 28px; padding: 4px 6px; font-size: 12px; }
    .empty { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 16px 12px; color: var(--vscode-descriptionForeground); background: var(--vscode-editorWidget-background); line-height: 1.45; }
  </style>
</head>
<body>
  <div class="shell">
    <div class="header">
      <div class="eyebrow">Figures</div>
      <h1>图片库 / Image Gallery</h1>
    </div>
    <div class="toolbar">
      <button id="add">添加图片</button>
      <button id="refresh" class="secondary">刷新</button>
    </div>
    <div id="drop" class="drop">
      <div>
        <span class="drop-title">拖入图片或 PDF</span>
        <span class="drop-copy">自动复制到 figures/，并在当前 TeX 文件插入 figure 块。</span>
      </div>
    </div>
    <div id="count" class="count"></div>
    <div id="grid" class="grid"></div>
  </div>
  <input id="file" type="file" accept="image/*,.pdf" multiple hidden>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const images = ${data};
    const grid = document.getElementById('grid');
    const input = document.getElementById('file');
    const drop = document.getElementById('drop');
    const count = document.getElementById('count');

    function render() {
      count.textContent = images.length ? images.length + ' 个资源在 figures/ 中' : 'figures/ 里还没有图片';
      grid.innerHTML = images.length ? '' : '<div class="empty">还没有可插入的图片。点击“添加图片”，或把图片直接拖到上面的虚线区域。</div>';
      for (const image of images) {
        const isPdf = image.ext === '.pdf';
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = '<div class="thumb">' + (isPdf ? '<div class="pdf-thumb">PDF</div>' : '<img src="' + image.src + '" alt="">') + '</div>' +
          '<div class="body"><div class="name">' + escapeHtml(image.name) + '</div>' +
          '<div class="meta">' + escapeHtml(image.rel) + ' · ' + formatBytes(image.size || 0) + '</div>' +
          '<div class="actions"><button data-action="insert">插入</button><button class="secondary" data-action="open">打开</button></div></div>';
        card.querySelector('[data-action="insert"]').addEventListener('click', () => vscode.postMessage({ command: 'insert', path: image.fullPath }));
        card.querySelector('[data-action="open"]').addEventListener('click', () => vscode.postMessage({ command: 'open', path: image.fullPath }));
        grid.appendChild(card);
      }
    }

    function escapeHtml(value) {
      return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
    }

    function formatBytes(value) {
      if (!value) return '0 B';
      if (value < 1024) return value + ' B';
      if (value < 1024 * 1024) return Math.round(value / 1024) + ' KB';
      return (value / 1024 / 1024).toFixed(1) + ' MB';
    }

    function addFiles(files) {
      for (const file of files) {
        if (!file.type.startsWith('image/') && !file.name.toLowerCase().endsWith('.pdf')) continue;
        const reader = new FileReader();
        reader.onload = () => vscode.postMessage({ command: 'addImage', name: file.name, dataUrl: reader.result });
        reader.readAsDataURL(file);
      }
    }

    document.getElementById('add').addEventListener('click', () => input.click());
    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ command: 'refresh' }));
    input.addEventListener('change', () => addFiles(input.files));
    drop.addEventListener('dragenter', (event) => { event.preventDefault(); drop.classList.add('active'); });
    drop.addEventListener('dragover', (event) => { event.preventDefault(); drop.classList.add('active'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('active'));
    drop.addEventListener('drop', (event) => { event.preventDefault(); drop.classList.remove('active'); addFiles(event.dataTransfer.files); });
    render();
  </script>
</body>
</html>`;
}

function getDashboardState() {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return {
      workspaceName: '未打开工作区',
      workspacePath: '请先打开一个 LaTeX 项目文件夹',
      mainName: '-',
      outputName: '-',
      pdfName: '-',
      mainExists: false,
      pdfExists: false,
      autoBuild: false
    };
  }

  const root = folder.uri.fsPath;
  const config = getConfig();
  const mainName = config.get('mainFile', 'main.tex');
  const outputName = config.get('outputDir', 'build');
  const mainFile = path.join(root, mainName);
  const outputDir = path.join(root, outputName);
  const pdfName = `${path.basename(mainName, path.extname(mainName))}.pdf`;

  return {
    workspaceName: path.basename(root),
    workspacePath: root,
    mainName,
    outputName,
    pdfName,
    mainExists: fs.existsSync(mainFile),
    pdfExists: fs.existsSync(path.join(outputDir, pdfName)),
    autoBuild: config.get('autoBuildOnSave', false)
  };
}

function dashboardHtml() {
  const nonce = Date.now().toString(36);
  const state = getDashboardState();
  const templateCards = PROJECT_TEMPLATES.map((template) => `
    <button class="template-card" data-action="newProject" data-value="${template.id}">
      <span class="card-kicker">模板</span>
      <span class="card-title">${escapeHtml(template.label)}</span>
      <span class="card-desc">${escapeHtml(template.description)}</span>
    </button>`).join('');
  const packageCards = COMMON_PACKAGES.map((pkg) => `
    <div class="pkg" data-package="${escapeHtml(`${pkg.label} ${pkg.description} ${pkg.install}`.toLowerCase())}">
      <div class="pkg-main">
        <div class="pkg-name">${escapeHtml(pkg.label)}</div>
        <div class="pkg-desc">${escapeHtml(pkg.description)}</div>
      </div>
      <div class="pkg-actions">
        <button data-action="addPackage" data-value="${pkg.label}">加入导言区</button>
        <button class="secondary" data-action="installPackage" data-value="${pkg.install}">安装包</button>
      </div>
    </div>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root { color-scheme: dark light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 12px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    .shell { display: grid; gap: 14px; }
    .section { display: grid; gap: 8px; }
    .section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    h2 { margin: 0; font-size: 13px; line-height: 1.25; font-weight: 650; }
    .subtle { color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.35; }
    .project {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 10px;
      background: var(--vscode-editorWidget-background);
      display: grid;
      gap: 9px;
    }
    .project-name { font-size: 14px; line-height: 1.3; font-weight: 650; overflow-wrap: anywhere; }
    .project-path { color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.35; overflow-wrap: anywhere; }
    .status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .status {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 7px;
      background: var(--vscode-input-background);
      min-width: 0;
    }
    .status-label { color: var(--vscode-descriptionForeground); font-size: 10px; margin-bottom: 3px; }
    .status-value { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .status.ok .status-value { color: var(--vscode-testing-iconPassed, var(--vscode-foreground)); }
    .status.warn .status-value { color: var(--vscode-testing-iconQueued, var(--vscode-foreground)); }
    .action-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); gap: 8px; }
    button {
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 6px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      padding: 8px 9px;
      cursor: pointer;
      font: inherit;
      text-align: left;
      min-height: 34px;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border-color: var(--vscode-panel-border);
    }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .action {
      display: grid;
      gap: 4px;
      background: var(--vscode-editorWidget-background);
      color: var(--vscode-foreground);
      border-color: var(--vscode-panel-border);
    }
    .action.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-border, transparent);
    }
    .action-title { font-weight: 650; line-height: 1.25; }
    .action-desc { color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.35; }
    .action.primary .action-desc { color: var(--vscode-button-foreground); opacity: .82; }
    .template-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(142px, 1fr)); gap: 8px; }
    .template-card {
      display: grid;
      gap: 5px;
      min-height: 84px;
      background: var(--vscode-editorWidget-background);
      color: var(--vscode-foreground);
      border-color: var(--vscode-panel-border);
    }
    .template-card:hover, .action:hover, .pkg:hover { border-color: var(--vscode-focusBorder); }
    .card-kicker {
      width: fit-content;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 1px 5px;
      color: var(--vscode-descriptionForeground);
      font-size: 10px;
    }
    .card-title { font-weight: 650; line-height: 1.25; }
    .card-desc, .pkg-desc { color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.35; }
    .package-filter {
      width: 100%;
      height: 30px;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 6px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      padding: 4px 8px;
      font: inherit;
    }
    .package-filter:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: 0; }
    .stack { display: grid; gap: 8px; }
    .pkg {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 9px;
      background: var(--vscode-editorWidget-background);
      display: grid;
      gap: 8px;
    }
    .pkg-name { font-weight: 650; margin-bottom: 2px; }
    .pkg-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .pkg-actions button { padding: 6px; text-align: center; font-size: 12px; }
  </style>
</head>
<body>
  <div class="shell">
    <section class="section">
      <div class="project">
        <div>
          <div class="project-name">${escapeHtml(state.workspaceName)}</div>
          <div class="project-path">${escapeHtml(state.workspacePath)}</div>
        </div>
        <div class="status-grid">
          <div class="status ${state.mainExists ? 'ok' : 'warn'}">
            <div class="status-label">主文件</div>
            <div class="status-value">${escapeHtml(state.mainName)} · ${state.mainExists ? '已找到' : '未找到'}</div>
          </div>
          <div class="status ${state.pdfExists ? 'ok' : 'warn'}">
            <div class="status-label">PDF</div>
            <div class="status-value">${escapeHtml(state.pdfName)} · ${state.pdfExists ? '已生成' : '待编译'}</div>
          </div>
          <div class="status">
            <div class="status-label">输出目录</div>
            <div class="status-value">${escapeHtml(state.outputName)}</div>
          </div>
          <div class="status ${state.autoBuild ? 'ok' : ''}">
            <div class="status-label">保存自动编译</div>
            <div class="status-value">${state.autoBuild ? '开启' : '关闭'}</div>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>当前项目</h2>
        <span class="subtle">Build & Preview</span>
      </div>
      <div class="action-grid">
        <button class="action primary" data-action="openPreview">
          <span class="action-title">右侧预览</span>
          <span class="action-desc">生成并刷新 PDF</span>
        </button>
        <button class="action" data-action="build">
          <span class="action-title">编译</span>
          <span class="action-desc">运行 XeLaTeX 两次</span>
        </button>
        <button class="action" data-action="openPdf">
          <span class="action-title">打开 PDF</span>
          <span class="action-desc">用 VS Code 打开结果</span>
        </button>
        <button class="action" data-action="initWorkspace">
          <span class="action-title">初始化</span>
          <span class="action-desc">创建 main.tex / figures / build</span>
        </button>
        <button class="action" data-action="ensurePackages">
          <span class="action-title">安装已用包</span>
          <span class="action-desc">扫描 usepackage</span>
        </button>
        <button class="action" data-action="clean">
          <span class="action-title">清理</span>
          <span class="action-desc">删除 build 输出</span>
        </button>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>新建模板</h2>
        <span class="subtle">Templates</span>
      </div>
      <div class="template-grid">
        ${templateCards}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>图片</h2>
        <span class="subtle">Figures</span>
      </div>
      <div class="action-grid">
        <button class="action" data-action="insertImage">
          <span class="action-title">添加图片</span>
          <span class="action-desc">复制到 figures 并插入代码</span>
        </button>
        <button class="action" data-action="pasteImage">
          <span class="action-title">粘贴截图</span>
          <span class="action-desc">从剪贴板保存 PNG</span>
        </button>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>导入导出</h2>
        <span class="subtle">Import & Export</span>
      </div>
      <div class="action-grid">
        <button class="action" data-action="importTex">
          <span class="action-title">导入 TeX</span>
          <span class="action-desc">导入单个 .tex 并设为主文件</span>
        </button>
        <button class="action" data-action="importZip">
          <span class="action-title">导入 ZIP</span>
          <span class="action-desc">从压缩包恢复项目</span>
        </button>
        <button class="action" data-action="exportZip">
          <span class="action-title">导出项目</span>
          <span class="action-desc">打包当前工程</span>
        </button>
        <button class="action" data-action="exportPdf">
          <span class="action-title">导出 PDF</span>
          <span class="action-desc">保存到指定位置</span>
        </button>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>常用包</h2>
        <span class="subtle">Packages</span>
      </div>
      <input id="package-filter" class="package-filter" type="search" placeholder="搜索包名，例如 ctex / hyperref / tikz">
      <div id="package-list" class="stack">
        ${packageCards}
      </div>
    </section>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      vscode.postMessage({ command: 'run', action: button.dataset.action, value: button.dataset.value || '' });
    });
    const packageFilter = document.getElementById('package-filter');
    const packages = Array.from(document.querySelectorAll('[data-package]'));
    packageFilter.addEventListener('input', () => {
      const query = packageFilter.value.trim().toLowerCase();
      for (const item of packages) {
        item.style.display = !query || item.dataset.package.includes(query) ? '' : 'none';
      }
    });
  </script>
</body>
</html>`;
}

function previewHtml(webview, pdfPath) {
  if (!extensionUri) {
    throw new Error('Extension URI is not initialized.');
  }
  const nonce = Date.now().toString(36);
  const stat = fs.statSync(pdfPath);
  const pdfUri = `${webview.asWebviewUri(vscode.Uri.file(pdfPath)).toString()}?v=${Math.floor(stat.mtimeMs)}`;
  const pdfJsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'pdfjs', 'build', 'pdf.min.js')).toString();
  const workerUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'pdfjs', 'build', 'pdf.worker.min.js')).toString();
  const cMapUri = `${webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'pdfjs', 'cmaps')).toString()}/`;
  const fontUri = `${webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'pdfjs', 'standard_fonts')).toString()}/`;
  const pdfDataBase64 = fs.readFileSync(pdfPath).toString('base64');
  const name = path.basename(pdfPath);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}' ${webview.cspSource}; style-src 'unsafe-inline' ${webview.cspSource}; worker-src ${webview.cspSource} blob:; connect-src ${webview.cspSource} data: blob:; font-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    .toolbar {
      height: 42px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editorWidget-background);
    }
    .title {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .file { color: var(--vscode-foreground); font-weight: 650; }
    .toolbar-group { display: flex; align-items: center; gap: 6px; }
    button {
      min-height: 28px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 6px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      padding: 4px 9px;
      cursor: pointer;
      font: inherit;
      white-space: nowrap;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border-color: var(--vscode-panel-border);
    }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    input {
      width: 54px;
      height: 28px;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 6px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      padding: 3px 6px;
      font: inherit;
      text-align: center;
    }
    .page-total, .zoom-label { color: var(--vscode-descriptionForeground); font-size: 12px; white-space: nowrap; }
    .viewer {
      height: calc(100% - 42px);
      overflow: auto;
      padding: 16px;
      background: var(--vscode-editor-background);
    }
    .status {
      width: min(100%, 980px);
      margin: 0 auto 12px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 9px 10px;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-editorWidget-background);
      line-height: 1.45;
    }
    .status[data-kind="ok"] { color: var(--vscode-testing-iconPassed); }
    .status[data-kind="error"] { color: var(--vscode-errorForeground); }
    .page {
      width: fit-content;
      max-width: 100%;
      margin: 0 auto 18px;
      display: grid;
      gap: 6px;
      position: relative;
    }
    .page-label {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      text-align: center;
    }
    canvas {
      display: block;
      max-width: 100%;
      background: #fff;
      box-shadow: 0 2px 14px rgba(0, 0, 0, .32);
    }
    canvas.sync-enabled { cursor: crosshair; }
    .sync-marker {
      position: absolute;
      width: 16px;
      height: 16px;
      border: 2px solid var(--vscode-editorInfo-foreground, #4ea1ff);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      box-shadow: 0 0 0 4px rgba(78, 161, 255, .22);
      pointer-events: none;
      z-index: 3;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="title"><span class="file">${escapeHtml(name)}</span> · 更新于 ${new Date(stat.mtimeMs).toLocaleTimeString()}</div>
    <div class="toolbar-group">
      <button id="build">编译</button>
      <button id="export" class="secondary">导出 PDF</button>
      <button id="open" class="secondary">打开 PDF</button>
    </div>
    <div class="toolbar-group">
      <button id="prev" class="secondary">上一页</button>
      <input id="page-number" type="number" min="1" value="1">
      <span id="page-total" class="page-total">/ -</span>
      <button id="next" class="secondary">下一页</button>
    </div>
    <div class="toolbar-group">
      <button id="zoom-out" class="secondary">-</button>
      <span id="zoom-label" class="zoom-label">100%</span>
      <button id="zoom-in" class="secondary">+</button>
      <button id="fit" class="secondary">适宽</button>
    </div>
  </div>
  <main id="viewer" class="viewer">
    <div id="status" class="status">正在加载 PDF...</div>
    <div id="pages"></div>
  </main>
  <script nonce="${nonce}" src="${pdfJsUri}"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const pdfUrl = ${JSON.stringify(pdfUri)};
    const pdfDataBase64 = ${JSON.stringify(pdfDataBase64)};
    const workerUrl = ${JSON.stringify(workerUri)};
    const cMapUrl = ${JSON.stringify(cMapUri)};
    const standardFontDataUrl = ${JSON.stringify(fontUri)};

    const viewer = document.getElementById('viewer');
    const pages = document.getElementById('pages');
    const status = document.getElementById('status');
    const pageNumber = document.getElementById('page-number');
    const pageTotal = document.getElementById('page-total');
    const zoomLabel = document.getElementById('zoom-label');
    const pdfjsLib = window.pdfjsLib;
    let statusTimer = 0;

    if (pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    } else {
      status.textContent = 'PDF.js 脚本未加载，请重新加载 VS Code 窗口后再试。';
    }

    window.addEventListener('error', (event) => {
      status.textContent = 'PDF.js 脚本错误：' + event.message;
    });
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      status.textContent = 'PDF.js 异步错误：' + (reason && reason.message ? reason.message : String(reason));
    });

    let pdfDoc = null;
    let scale = 1;
    let currentPage = 1;
    let renderToken = 0;
    let pageTops = [];
    let pendingPdfSync = null;
    let markerTimer = 0;

    document.getElementById('build').addEventListener('click', () => vscode.postMessage({ command: 'build' }));
    document.getElementById('open').addEventListener('click', () => vscode.postMessage({ command: 'openPdf' }));
    document.getElementById('export').addEventListener('click', () => vscode.postMessage({ command: 'exportPdf' }));
    document.getElementById('zoom-in').addEventListener('click', () => setScale(scale + 0.15));
    document.getElementById('zoom-out').addEventListener('click', () => setScale(scale - 0.15));
    document.getElementById('fit').addEventListener('click', fitWidth);
    document.getElementById('prev').addEventListener('click', () => scrollToPage(Math.max(1, currentPage - 1)));
    document.getElementById('next').addEventListener('click', () => scrollToPage(Math.min(pdfDoc?.numPages || 1, currentPage + 1)));
    pageNumber.addEventListener('change', () => {
      const target = Number(pageNumber.value);
      if (Number.isFinite(target)) {
        scrollToPage(Math.min(Math.max(1, target), pdfDoc?.numPages || 1));
      }
    });
    viewer.addEventListener('scroll', updateCurrentPage, { passive: true });
    window.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.command === 'syncStatus') {
        showStatus(message.message || '', message.level || '', message.level === 'ok');
      } else if (message.command === 'syncToPdf') {
        pendingPdfSync = message;
        scrollToPdfPoint(message);
      }
    });

    async function load() {
      let restoreWorker = null;
      try {
        showStatus('PDF.js 已启动，正在解析 PDF...', '');
        if (typeof window.Worker === 'function') {
          const nativeWorker = window.Worker;
          window.Worker = function DisabledPdfWorker() {
            throw new Error('PDF.js worker disabled for VS Code webview.');
          };
          restoreWorker = () => {
            window.Worker = nativeWorker;
          };
        }
        const loadingTask = pdfjsLib.getDocument({
          data: decodeBase64(pdfDataBase64),
          cMapUrl,
          cMapPacked: true,
          standardFontDataUrl
        });
        restoreWorker?.();
        restoreWorker = null;
        pdfDoc = await loadingTask.promise;
        pageTotal.textContent = '/ ' + pdfDoc.numPages;
        pageNumber.max = String(pdfDoc.numPages);
        await fitWidth();
      } catch (error) {
        restoreWorker?.();
        showStatus('PDF.js 加载失败：' + (error && error.message ? error.message : String(error)), 'error');
      }
    }

    function decodeBase64(value) {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }

    async function fitWidth() {
      if (!pdfDoc) return;
      const page = await pdfDoc.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const available = Math.max(320, viewer.clientWidth - 36);
      await setScale(available / viewport.width);
    }

    async function setScale(nextScale) {
      if (!pdfDoc) return;
      scale = Math.min(3, Math.max(0.35, nextScale));
      zoomLabel.textContent = Math.round(scale * 100) + '%';
      await renderAll();
    }

    async function renderAll() {
      const token = ++renderToken;
      showStatus('正在渲染 PDF...', '');
      pages.innerHTML = '';
      pageTops = [];

      for (let pageIndex = 1; pageIndex <= pdfDoc.numPages; pageIndex += 1) {
        if (token !== renderToken) return;
        const wrapper = document.createElement('section');
        wrapper.className = 'page';
        wrapper.dataset.page = String(pageIndex);
        wrapper.innerHTML = '<div class="page-label">第 ' + pageIndex + ' 页</div>';
        const canvas = document.createElement('canvas');
        canvas.className = 'sync-enabled';
        canvas.title = '点击跳转到 TeX 源码';
        canvas.addEventListener('click', (event) => syncToSource(pageIndex, canvas, event));
        wrapper.appendChild(canvas);
        pages.appendChild(wrapper);
        await renderPage(pageIndex, canvas);
      }

      status.style.display = 'none';
      requestAnimationFrame(() => {
        pageTops = Array.from(document.querySelectorAll('.page')).map((page) => page.offsetTop);
        updateCurrentPage();
        if (pendingPdfSync) {
          scrollToPdfPoint(pendingPdfSync);
        }
      });
    }

    async function renderPage(pageIndex, canvas) {
      const page = await pdfDoc.getPage(pageIndex);
      const viewport = page.getViewport({ scale });
      const outputScale = window.devicePixelRatio || 1;
      const context = canvas.getContext('2d', { alpha: false });
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + 'px';
      canvas.style.height = Math.floor(viewport.height) + 'px';
      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
      await page.render({ canvasContext: context, viewport, transform }).promise;
    }

    function syncToSource(pageIndex, canvas, event) {
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / scale;
      const y = (event.clientY - rect.top) / scale;
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
        return;
      }
      showStatus('正在定位 TeX 源码...', '');
      vscode.postMessage({
        command: 'syncToSource',
        page: pageIndex,
        x,
        y
      });
    }

    function scrollToPage(pageIndex) {
      const target = document.querySelector('.page[data-page="' + pageIndex + '"]');
      if (target) {
        target.scrollIntoView({ block: 'start' });
      }
    }

    function scrollToPdfPoint(target) {
      if (!target || !pdfDoc) return;
      const pageIndex = Number(target.page);
      const x = Number(target.x);
      const y = Number(target.y);
      if (!Number.isFinite(pageIndex) || !Number.isFinite(x) || !Number.isFinite(y)) return;
      const page = document.querySelector('.page[data-page="' + pageIndex + '"]');
      const canvas = page?.querySelector('canvas');
      if (!page || !canvas) return;

      pendingPdfSync = null;
      const marker = ensureSyncMarker(page);
      const markerLeft = canvas.offsetLeft + x * scale;
      const markerTop = canvas.offsetTop + y * scale;
      marker.style.left = markerLeft + 'px';
      marker.style.top = markerTop + 'px';
      marker.style.display = '';
      clearTimeout(markerTimer);
      markerTimer = setTimeout(() => {
        marker.style.display = 'none';
      }, 2600);

      const top = page.offsetTop + canvas.offsetTop + y * scale - viewer.clientHeight * 0.45;
      viewer.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      currentPage = pageIndex;
      pageNumber.value = String(pageIndex);
      showStatus('已定位到 PDF 第 ' + pageIndex + ' 页', 'ok', true);
    }

    function ensureSyncMarker(page) {
      let marker = page.querySelector('.sync-marker');
      if (!marker) {
        marker = document.createElement('div');
        marker.className = 'sync-marker';
        marker.style.display = 'none';
        page.appendChild(marker);
      }
      return marker;
    }

    function updateCurrentPage() {
      if (!pageTops.length) return;
      const y = viewer.scrollTop + 24;
      let page = 1;
      for (let i = 0; i < pageTops.length; i += 1) {
        if (pageTops[i] <= y) {
          page = i + 1;
        } else {
          break;
        }
      }
      currentPage = page;
      pageNumber.value = String(page);
    }

    function showStatus(message, kind = '', autoHide = false) {
      clearTimeout(statusTimer);
      status.textContent = message;
      status.dataset.kind = kind;
      status.style.display = '';
      if (autoHide) {
        statusTimer = setTimeout(() => {
          status.style.display = 'none';
          status.dataset.kind = '';
        }, 2200);
      }
    }

    if (pdfjsLib) {
      load();
    }
  </script>
</body>
</html>`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

function defaultMainTex() {
  return `\\documentclass[UTF8,a4paper,12pt]{ctexart}

\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage{amsmath}
\\usepackage{geometry}

\\geometry{margin=2.5cm}
\\graphicspath{{figures/}}

\\title{Local LaTeX Document}
\\author{}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Start}

Write here.

\\end{document}
`;
}

function englishArticleTex() {
  return `\\documentclass[a4paper,12pt]{article}

\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage{amsmath}
\\usepackage{geometry}
\\usepackage{hyperref}

\\geometry{margin=1in}
\\graphicspath{{figures/}}

\\title{Local LaTeX Article}
\\author{}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
Write the abstract here.
\\end{abstract}

\\section{Introduction}

Start writing here.

\\end{document}
`;
}

function beamerTex() {
  return `\\documentclass[UTF8]{ctexbeamer}

\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage{amsmath}

\\title{演示文稿标题}
\\author{}
\\date{\\today}

\\begin{document}

\\frame{\\titlepage}

\\begin{frame}{目录}
  \\tableofcontents
\\end{frame}

\\section{第一部分}

\\begin{frame}{页面标题}
  \\begin{itemize}
    \\item 要点一
    \\item 要点二
  \\end{itemize}
\\end{frame}

\\end{document}
`;
}

function thesisTex() {
  return `\\documentclass[UTF8,a4paper,12pt]{ctexart}

\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage{amsmath}
\\usepackage{geometry}

\\geometry{margin=2.5cm}
\\graphicspath{{figures/}}

\\title{论文题目}
\\author{}
\\date{\\today}

\\begin{document}

\\maketitle
\\tableofcontents
\\newpage

\\input{chapters/intro}
\\input{chapters/method}

\\section{结论}

在这里写结论。

\\bibliographystyle{plain}
\\bibliography{refs}

\\end{document}
`;
}

function ieeeLikeTex() {
  return `\\documentclass[conference]{IEEEtran}

\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage{amsmath}
\\usepackage{cite}

\\title{Paper Title}
\\author{\\IEEEauthorblockN{Author Name}
\\IEEEauthorblockA{Organization\\\\
Email}}

\\begin{document}

\\maketitle

\\begin{abstract}
Write the abstract here.
\\end{abstract}

\\begin{IEEEkeywords}
keyword one, keyword two
\\end{IEEEkeywords}

\\section{Introduction}

Start writing here.

\\bibliographystyle{IEEEtran}
\\bibliography{refs}

\\end{document}
`;
}

function defaultWorkspaceSettings() {
  return {
    'localLatex.autoBuildOnSave': true,
    'localLatex.openPreviewAfterBuild': true,
    'localLatex.forwardSyncOnCursor': true,
    'latex-workshop.latex.autoBuild.run': 'never',
    'latex-utilities.texdef.enabled': false,
    'latex-utilities.countWord.format': '',
    'latex-utilities.message.update.show': false,
    'files.associations': {
      '*.tex': 'latex'
    },
    'editor.snippetSuggestions': 'top'
  };
}

function defaultWorkspaceExtensions() {
  return {
    recommendations: [
      'ah-local.local-latex-workbench',
      'James-Yu.latex-workshop'
    ]
  };
}

function defaultGitignore() {
  return `build/
*.aux
*.bbl
*.bcf
*.blg
*.fdb_latexmk
*.fls
*.log
*.out
*.run.xml
*.synctex.gz
*.toc
`;
}

module.exports = {
  activate,
  deactivate
};
