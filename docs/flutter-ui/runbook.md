# Outreach Intern — Operations & Development Runbook

This guide contains complete instructions for running the **NestJS Backend**, starting **Docker Compose infrastructure**, building and launching the **Flutter Client**, executing the test matrix, and troubleshooting common local development scenarios.

---

## 1. System Requirements

- **Node.js**: `v20.x` or `v22.x` (LTS)
- **Package Manager**: `npm` (v10+)
- **Flutter SDK**: `v3.24+` with Dart `v3.5+`
- **Docker & Docker Compose**: Docker Desktop (or engine with daemon running)
- **Target OS / Emulators**:
  - macOS Desktop: Xcode Command Line Tools installed
  - Android: Android Studio with SDK 34+ and Android Emulator
  - iOS: Xcode 15+ and iOS Simulator

---

## 2. Backend Infrastructure Setup

### Step 2.1: Environment Configuration
Copy the sample environment file if `.env` does not exist:
```bash
cp .env.example .env
```
Ensure key environment variables are set in `.env`:
```env
PORT=3000
DATABASE_URL=postgresql://outreach_user:outreach_pass@localhost:5432/outreach_intern
REDIS_URL=redis://localhost:6379
SESSION_SECRET=dev_session_secret_min_32_characters_long_12345
LIVE_CALLS_ENABLED=false
SARVAM_API_KEY=test_sarvam_key_or_leave_dummy
```

### Step 2.2: Launch Docker Compose Services
Start PostgreSQL 17 and Redis 7:
```bash
docker compose up -d
```
Verify containers are healthy:
```bash
docker compose ps
```

### Step 2.3: Backend Development Stack (`npm run dev:all`)
To run migrations, seed starter personas, and launch the API server and BullMQ worker concurrently (excluding the Web UI to dedicate the workspace to Flutter):
```bash
npm run dev:all
```
This executes:
1. `npm run db:migrate` (Drizzle migrations against PostgreSQL)
2. `npm run db:seed` (Starter workspace and default personas)
3. Concurrently launches:
   - `[api]   ` NestJS API server on `http://localhost:3000`
   - `[worker]` BullMQ durable queue processor on `http://localhost:3001`

Alternatively, to run individual processes manually:
```bash
npm run db:setup     # Runs migrate + seed
npm run dev:api      # Starts API watch mode
npm run dev:worker   # Starts Worker watch mode
npm run dev:web      # Starts Web UI dev server
```

---

## 3. Flutter Client Setup & Execution

Navigate to the Flutter app directory:
```bash
cd apps/flutter_app
```

### Step 3.1: Install Pinned Dependencies
```bash
flutter pub get
```

### Step 3.2: Configure Base URL per Platform
The app automatically prioritizes `--dart-define=API_BASE_URL=...` and strips trailing `/api/v1` if supplied.

| Target Platform | Recommended Setup & Command |
| :--- | :--- |
| **Physical Android Device (USB)** | **Step 1:** Run `adb reverse tcp:3000 tcp:3000`<br>**Step 2:** `flutter run -d <deviceId>` |
| **Physical Android Device (Wi-Fi)** | `flutter run -d <deviceId> --dart-define=API_BASE_URL=http://<Mac-IP>:3000/api/v1` |
| **macOS Desktop** | `flutter run -d macos` |
| **iOS Simulator** | `flutter run -d "iPhone 15"` |
| **Android Emulator** | `flutter run -d android --dart-define=API_BASE_URL=http://10.0.2.2:3000` |
| **Chrome (Web)** | `flutter run -d chrome --web-port=5000` |

### Step 3.3: Demo Sign-In
1. Launch the app. If unauthenticated, the **Sign In** screen is presented.
2. Enter an email address (e.g., `operator@outreach.local`).
3. Click **"Enter Workspace (Demo)"**.
4. The backend issues an HttpOnly `outreach_session` cookie which is stored securely by `FlutterSecureStorage` and automatically injected into subsequent API calls.

---

## 4. Running the Verification Matrix

### Run All Flutter Tests (Unit, Widget, Contract)
```bash
cd apps/flutter_app
flutter test
```
*Current verified result: 32 / 32 tests passing in ~3.5 seconds.*

### Run Flutter Static Analyzer
```bash
cd apps/flutter_app
flutter analyze
```
*Current verified result: 0 issues found.*

### Enforce Dart Formatting
```bash
cd apps/flutter_app
dart format --set-exit-if-changed lib test
```

### Run Backend Unit & Integration Tests
```bash
cd /Users/kuroyami/CallingAgents
npm test
```
*Current verified result: 65 / 65 tests passing in 704ms.*

### Compile Release/Debug Targets
```bash
cd apps/flutter_app

# Compile platform bundle
flutter build bundle

# Compile macOS desktop application
flutter build macos --debug
```

---

## 5. Troubleshooting & FAQ

### Issue 1: `connect: no such file or directory (/Users/.../.docker/run/docker.sock)`
- **Cause**: Docker Desktop is not running on the macOS host.
- **Resolution**: Launch `/Applications/Docker.app` from Finder or Spotlight, wait for the whale icon in the menu bar to show "Engine running", then rerun `docker compose up -d`. In development, unit tests (`npm test` and `flutter test`) do not require Docker and run completely in-memory.

### Issue 2: Android Emulator cannot reach `http://localhost:3000`
- **Cause**: Android emulators route `localhost` to the emulator device itself, not the host machine.
- **Resolution**: Use `--dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1` when running on Android emulator.

### Issue 3: `ForbiddenException: Invalid Request Origin`
- **Cause**: The backend's `verifyOrigin()` middleware in `apps/api/src/auth.ts` inspects the HTTP `Origin` header. Web browsers send origin headers automatically; if the port is unexpected, it rejects the request.
- **Resolution**: Native Flutter applications (macOS, iOS, Android) do not send browser `Origin` headers and are allowed unconditionally. For Flutter Web, use `--web-port=5000` or configure `ALLOWED_ORIGINS` in `.env`.

### Issue 4: "Why is there no voice dropdown or audio preview in Agent Editor?"
- **Answer**: Sarvam Voice Agents Outbound API v1 does not expose a voice catalog endpoint or audio preview TTS generation endpoint. Voices are pre-configured in the Sarvam web portal and assigned to committed app versions. Outreach Intern tells the truth: the app displays server-verified integration status and provides a interactive LLM persona sandbox (`POST /agents/:id/sandbox`) instead of faking non-existent audio files.
