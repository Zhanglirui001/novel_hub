# Novel Hub one-click startup (Windows)

## Normal use

Double-click `start.bat` to start Novel Hub. The script checks the runtime environment,
installs missing dependencies on first use, initializes MySQL, starts the API and web
services, waits for both services to become ready, and then opens the web page.

Double-click `stop.bat` to stop only the frontend and backend processes created by the
startup script.

The default addresses are:

- Web: <http://localhost:3001>
- API: <http://127.0.0.1:8000>
- API documentation: <http://127.0.0.1:8000/docs>

Runtime state and logs are stored in `.runtime/`. This directory is ignored by Git.

## PowerShell options

Run these commands from the project root:

```powershell
# Start without opening a browser.
.\start.ps1 -NoBrowser

# Skip dependency checks and installation.
.\start.ps1 -SkipInstall

# Use a longer readiness timeout.
.\start.ps1 -StartupTimeoutSeconds 120

# Stop the managed services.
.\stop.ps1
```

The same startup options can be passed through the batch file, for example:

```bat
start.bat -NoBrowser -SkipInstall
```

## Requirements

- Windows PowerShell 5.1 or PowerShell 7
- Python 3.10 or newer
- Node.js 18 or newer
- A running MySQL 5.7/8.0 server

Database connection values can be overridden in the root `.env` file. If startup
fails, inspect `.runtime/backend.stderr.log` and `.runtime/frontend.stderr.log`.

If Windows resolves `python.exe` to the Microsoft Store placeholder, explicitly set
the interpreter before starting:

```powershell
$env:NOVEL_HUB_PYTHON = "C:\path\to\python.exe"
.\start.ps1
```
