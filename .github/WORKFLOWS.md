# GitHub Actions Workflows

This document explains the CI/CD workflows for the GitMesh VS Code extension.

## Workflows

### 1. Package Extension (`package.yml`)

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches
- Manual trigger via GitHub Actions UI

**What it does:**
- Tests the extension on Node.js 18.x and 20.x
- Installs dependencies with `npm ci`
- Compiles TypeScript and bundles React webview
- Packages the extension as a `.vsix` file
- Uploads the VSIX as a downloadable artifact (30-day retention)

**Downloading the VSIX:**
1. Go to the Actions tab in your GitHub repository
2. Click on the latest successful workflow run
3. Scroll down to "Artifacts" section
4. Download `gitmesh-vsix`

### 2. Release Extension (`release.yml`)

**Triggers:**
- Push to `main` branch (automatic)

**What it does:**
- Compiles and packages the extension
- Auto-bumps the patch version in `package.json`
- Commits the version bump back to `main` with `[skip ci]` (prevents infinite loop)
- Creates and pushes a git tag (e.g. `v0.1.2`)
- **Automatically creates a GitHub Release** with the VSIX attached
- Generates release notes automatically
- Stores VSIX as artifact (90-day retention)

## Creating a Release

Releases are fully automatic. Every push to `main` triggers:

1. Compile and package the VSIX
2. Auto-bump the patch version in `package.json`
3. Commit the version bump back to `main` with `[skip ci]` (prevents loop)
4. Create and push a git tag (e.g. `v0.1.2`)
5. Publish a GitHub Release with the `.vsix` attached and auto-generated release notes

**To release:** just push to `main`. No manual steps needed.

**To bump minor or major:** update `package.json` version manually before pushing,
and the workflow will bump patch on top of that.

## Manual Packaging

To package locally without GitHub Actions:

```bash
# Install dependencies
npm install

# Compile extension
npm run compile

# Package as VSIX
npm run package

# This creates: gitmesh-0.1.0.vsix
```

## Installing the VSIX Locally

### Option 1: VS Code UI
1. Open VS Code
2. Go to Extensions view (Cmd+Shift+X / Ctrl+Shift+X)
3. Click "..." menu → "Install from VSIX..."
4. Select the `.vsix` file

### Option 2: Command Line
```bash
code --install-extension gitmesh-0.1.0.vsix
```

## Troubleshooting

### Workflow fails with "npm ci" error
- Ensure `package-lock.json` is committed to the repository
- Check that all dependencies are properly listed in `package.json`

### VSIX packaging fails
- Verify all required files are included (check `.vscodeignore`)
- Ensure `out/` directory is generated during compilation
- Check that webpack successfully bundles the webview

### "Cannot find module" errors during compilation
- Run `npm install` to ensure all dependencies are installed
- Check that TypeScript paths are configured correctly in `tsconfig.json`
- Verify all import statements use correct relative paths

## Workflow Artifacts

- **package.yml**: Artifacts retained for 30 days
- **release.yml**: Artifacts retained for 90 days

To download artifacts:
1. Go to Actions tab
2. Select the workflow run
3. Scroll to "Artifacts" section
4. Click to download

## Version Management

The extension version is managed in `package.json`:

```json
{
  "version": "0.1.0"
}
```

**Versioning guidelines:**
- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features, backwards compatible
- **Patch** (0.0.1): Bug fixes

To manually bump minor or major before pushing to `main`:

```bash
npm version patch --no-git-tag-version  # 0.1.0 → 0.1.1
npm version minor --no-git-tag-version  # 0.1.0 → 0.2.0
npm version major --no-git-tag-version  # 0.1.0 → 1.0.0
```

This updates `package.json` only. The release workflow handles tagging automatically.
