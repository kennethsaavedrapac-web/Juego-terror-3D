# Offline, deterministic UV adaptation; run from the repository root on Windows.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -Path (Join-Path $PSScriptRoot 'BakeWatcherTextures.cs') -ReferencedAssemblies @('System.Drawing.Common', 'System.Drawing.Primitives', 'System.Private.Windows.GdiPlus', 'System.Private.Windows.Core', 'System.Runtime', 'System.Runtime.InteropServices', 'System.Collections', 'System.Console')
$repo = Split-Path $PSScriptRoot -Parent
[BakeWatcherTextures]::Run((Join-Path $repo 'assets/monster/source'), (Join-Path $repo 'public/monster/textures'), (Join-Path $repo 'src/game/watcherAtlas.ts'))

