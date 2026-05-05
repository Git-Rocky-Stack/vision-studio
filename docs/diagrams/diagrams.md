# Vision Studio — Diagram Library

> Standalone Mermaid sources for embedding in slides, talks, or other docs.
> The same diagrams are also inlined where they tell a story in [`../ARCHITECTURE.md`](../ARCHITECTURE.md) and [`../API_ENDPOINTS.md`](../API_ENDPOINTS.md).

GitHub renders these inline. To render them locally: `npx -p @mermaid-js/mermaid-cli mmdc -i diagrams.md -o diagrams.svg`.

---

## 1. Process model (high-level)

```mermaid
graph TB
    subgraph Renderer["Renderer (Chromium, sandboxed)"]
        UI[React 19 + Vite + Zustand + dockview]
    end
    subgraph Main["Main (Electron 33, Node.js)"]
        IPC[ipcMain handlers]
        Spawn[BackendProcessService]
        Store[(electron-store + safeStorage)]
        WS[WebSocket client]
    end
    subgraph Backend["Backend (FastAPI + Uvicorn :8000)"]
        REST[REST + WS routers]
        Jobs[JobManager]
        Models[ModelManager]
        DG[DirectGenerator]
        DVG[DirectVideoGenerator]
        DB[(SQLite vision_studio.db)]
        FS[(filesystem)]
    end
    UI -- "window.electron.* (preload)" --> IPC
    IPC -- "axios + token" --> REST
    WS -- "ws + token" --> REST
    Spawn -- "spawn / monitor" --> Backend
    REST --> Jobs
    REST --> Models
    Jobs --> DG
    Jobs --> DVG
    REST --> DB
    DG --> FS
    DVG --> FS
```

---

## 2. Composition root (Main process)

```mermaid
graph LR
    Boot["main.ts (entrypoint)"] --> CMS["createMainProcessServices()"]
    CMS --> SS[secureStore]
    CMS --> OR[outputRoots]
    CMS --> FR[firstRun]
    CMS --> UA[userAccounts]
    CMS --> ORS[openRouterService]
    CMS --> MW[mainWindow]
    CMS --> BP[backendProcess]
    CMS --> CGHS[configureGenerationHandlerServices]
    CMS --> RIH[registerMainIpcHandlers]
    CMS --> SGH[setupGenerationHandlers]
    CMS --> RCSP[registerContentSecurityPolicy]
```

---

## 3. Image generation flow (local backend)

```mermaid
sequenceDiagram
    autonumber
    participant U as Renderer
    participant E as Main IPC
    participant B as Backend HTTP
    participant J as JobManager
    participant T as BackgroundTasks
    participant DG as DirectGenerator
    participant CC as ComfyUIClient
    participant FS as Filesystem
    U->>E: window.electron.generation.generateImage(params)
    E->>B: POST /api/generate/image (token)
    B->>J: add_job(pending)
    B->>T: schedule process_image_generation
    B-->>E: { job_id, "pending" }
    E-->>U: { success, jobId }
    T->>J: update_job(processing, 0)
    alt ComfyUI connected
        T->>CC: queue_prompt(workflow)
        CC-->>T: outputs
        T->>FS: write OUTPUT_DIR/<job>/image_NNN.png
    else direct fallback
        T->>DG: generate_image(...)
        DG-->>T: { images, seed, ... }
    end
    T->>J: update_job(completed, result)
    par WebSocket fan-out (every 500ms while processing)
        B-->>E: ws "job_update" frames
        E-->>U: generation:progress event
    end
```

---

## 4. Image generation flow (OpenRouter route)

```mermaid
sequenceDiagram
    autonumber
    participant U as Renderer
    participant E as Main (generation IPC)
    participant UA as userAccounts
    participant OR as OpenRouterService
    participant API as OpenRouter API
    participant FS as Filesystem
    U->>E: generation.generateImage(params)
    E->>UA: getActiveAccount()
    UA-->>E: { provider:"openrouter", model:"...", apiKeyStored:true }
    E->>E: validate (no controlnet/inpaint, model selected)
    E->>E: setOpenRouterJob(pending)
    E-->>U: { success, jobId: openrouter-image-<uuid> }
    E->>UA: getOpenRouterApiKey(accountId)  (decrypts via safeStorage)
    E->>OR: generateImage({apiKey, model, prompt, ...})
    OR->>API: POST /api/v1/chat/completions (BYO key)
    API-->>OR: image data URL(s)
    OR-->>E: { images, responseId, content, model }
    E->>FS: write outputRoot/openrouter/YYYY-MM-DD/<jobId>-<n>.<ext>
    E->>E: patchOpenRouterJob(completed)
    E-->>U: generation:progress { completed, 100 }
```

---

## 5. Settings update with backend restart

```mermaid
sequenceDiagram
    autonumber
    participant U as Renderer (SettingsPanel)
    participant E as Main IPC
    participant S as electron-store
    participant OR as outputRoots
    participant BP as backendProcess
    U->>E: settings:update(patch)
    E->>OR: getAppSettings()
    E->>S: store.set('settings', merged)
    E->>OR: rememberOutputRoot(resolveOutputPath(merged, userData))
    E->>E: shouldRestartBackend(prev, next)?
    alt restart needed
        E->>BP: restartIfRunning()
        BP->>BP: stop child, spawn fresh, await /api/health
        BP-->>E: true
    end
    E-->>U: nextSettings
```

---

## 6. Asset import vs export (security paths)

```mermaid
flowchart TD
    UImp["Renderer assets.importFiles(paths[])"] --> EImp["mainIpc 'assets:import-files'"]
    EImp --> Type["resolveImportedMediaType(ext) -> image/video/audio/null"]
    EImp --> Mkdir["mkdir <outputRoot>/imports"]
    EImp --> Cp["fs.copyFile(source -> outputRoot/imports/<safeName>)"]

    UExp["Renderer assets.export(src, dest)"] --> EExp["mainIpc 'assets:export'"]
    EExp --> RM["outputRoots.resolveManagedAssetPath(src)"]
    EExp --> RD["resolveSafeExportDestination(dest, allowedExportRoots)"]
    EExp --> Mkdir2["mkdir parent of dest"]
    EExp --> CpE["fs.copyFile(resolvedSrc -> resolvedDest)"]
```

---

## 7. Job lifecycle

```mermaid
stateDiagram-v2
    [*] --> pending: add_job
    pending --> processing: BackgroundTasks dequeues
    processing --> completed: success -> result
    processing --> failed: exception -> error
    processing --> cancelled: POST /api/jobs/{id}/cancel
    pending --> cancelled
    completed --> [*]
    failed --> [*]
    cancelled --> [*]

    note right of completed
        cleanup_old_jobs(max_age_hours=24)
        prunes terminal jobs
    end note
```

---

## 8. Database ER diagram

```mermaid
erDiagram
    images {
        INTEGER id PK
        TEXT prompt
        TEXT negative_prompt
        TEXT model
        INTEGER width
        INTEGER height
        INTEGER seed
        TEXT created_at
        TEXT data
    }
    jobs {
        INTEGER id PK
        TEXT type
        TEXT status
        REAL progress
        TEXT created_at
        TEXT completed_at
        TEXT error
    }
    settings {
        TEXT key PK
        TEXT value
        TEXT updated_at
    }
    schema_version {
        INTEGER version
    }
```

---

## 9. First launch sequence

```mermaid
sequenceDiagram
    autonumber
    participant App as Electron App
    participant FR as FirstRunService
    participant BP as BackendProcessService
    participant Py as Python Backend
    participant FS as Filesystem
    participant Win as MainWindow
    App->>Win: createWindow()
    Win->>FR: ready-to-show -> checkFirstRun()
    FR->>FR: read electron-store key 'firstRun'
    alt firstRun === true
        FR->>App: dialog.showMessageBox(welcome)
        FR->>FS: ensure userData dirs
        FR->>FR: store.set('firstRun', false)
    end
    App->>BP: start()
    BP->>FS: locate bundled backend exe
    BP->>Py: spawn child process
    Py->>FS: extract PyInstaller bundle to TEMP (~2.4 GB, slow first time)
    Py->>Py: run_migrations(DATABASE_PATH)
    Py->>Py: lifespan: ComfyUI? -> fallback DirectGenerator
    Py->>Py: ModelManager.scan_models()
    Py-->>BP: HTTP /api/health 200
    BP-->>App: ready
```

---

## 10. Release pipeline

```mermaid
sequenceDiagram
    autonumber
    participant Dev as Developer
    participant CI as PR Gate (CI)
    participant Rel as Release Workflow
    participant Sign as Signing
    participant CDN as GitHub Releases
    Dev->>CI: Push branch / open PR
    CI->>CI: lint + typecheck + test + test:e2e
    CI-->>Dev: PASS / FAIL
    Dev->>CI: Merge to main
    CI->>CI: Bump version, update CHANGELOG
    Dev->>Rel: Tag vX.Y.Z (or workflow_dispatch)
    Rel->>Rel: build:backend -> package per platform
    Rel->>Sign: verify-release-signing.cjs --package-win
    Sign-->>Rel: PASS
    Rel->>CDN: Upload installers + latest.yml
    CDN-->>Dev: Release published
```

---

## 11. Trust boundary (textual)

```mermaid
flowchart LR
    R["Renderer (UNTRUSTED)<br/>contextIsolation: true<br/>nodeIntegration: false<br/>sandbox-able"]
    P["Preload (mediator)<br/>contextBridge.exposeInMainWorld('electron', api)"]
    M["Main (TRUSTED)<br/>fs/path/process,<br/>store/safeStorage,<br/>backend supervision"]
    B["Backend (TRUSTED, loopback)<br/>x-vision-studio-token,<br/>Pydantic, slowapi,<br/>sanitization"]
    R -->|typed window.electron.*| P
    P -->|ipcRenderer.invoke| M
    M -->|axios + token| B
    B -- "CORS: localhost:5173 only<br/>Static /outputs: token-exempt" --> M
```
