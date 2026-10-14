# No, YOU Pick!

<!-- intent-select-partner:start -->
<p><a href="https://intentsolutions.io/"><img src="https://raw.githubusercontent.com/intent-solutions-io/.github/b82af5d3e7951d85e39ea9e65cc24ee8278722a7/assets/brand/claude-select-partner.svg" alt="Intent Solutions: Claude Partner Network Select Services Partner" width="300" height="95" /></a></p>

Intent Solutions is a Claude Partner Network Select Services Partner.
<!-- intent-select-partner:end -->

> **The Argument Ender** - AI-powered restaurant picker that chooses 3 random spots so you don't have to fight about it.

[![Live Web App](https://img.shields.io/badge/Web%20App-Live-00C853?logo=firebase&logoColor=white)](https://noupick-prod.web.app)
[![Cloud Run API](https://img.shields.io/badge/API-Production-4285F4?logo=google-cloud&logoColor=white)](https://noupick-api-246498703732.us-central1.run.app/health)
[![Made with React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![React Native](https://img.shields.io/badge/React%20Native-Expo-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![Powered by Vertex AI](https://img.shields.io/badge/Vertex%20AI-Gemini%202.5-4285F4?logo=google&logoColor=white)](https://cloud.google.com/vertex-ai)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/U5S225PTME)

---

## Live Demo

**Web App:** https://noupick-prod.web.app
**API Health:** https://noupick-api-246498703732.us-central1.run.app/health

---

## What It Does

Can't decide where to eat? **No, YOU Pick!** uses Google Vertex AI Gemini to instantly suggest **3 random restaurants** based on:

- **Your Location** - City, address, or zip code
- **Cuisine Preferences** - 16 options from Pizza to Thai
- **Search Radius** - 1mi to 30mi
- **Spin Again** - Don't like the picks? Get 3 new ones

---

## Architecture

```
+-------------------+     +-------------------+     +-------------------+
|   Mobile App      |     |    Web App        |     |   Cloud Run API   |
|   (React Native)  | --> |   (React/Vite)    | --> |   (Node.js)       |
|   pablo-mobile/   |     |   Firebase Host   |     |   Vertex AI       |
+-------------------+     +-------------------+     +-------------------+
                                    |                        |
                                    v                        v
                          +-------------------+     +-------------------+
                          | Firebase Hosting  |     | Gemini 2.5 Flash  |
                          | noupick-prod      |     | us-central1       |
                          +-------------------+     +-------------------+
```

### Production Stack

| Component | Technology | URL/Location |
|-----------|------------|--------------|
| **Backend API** | Cloud Run + Node.js | https://noupick-api-246498703732.us-central1.run.app |
| **AI Engine** | Vertex AI Gemini 2.5 Flash | `us-central1` |
| **Web App** | React 19 + Vite + Firebase | https://noupick-prod.web.app |
| **Mobile App** | React Native + Expo | `pablo-mobile/` |
| **Auth** | Application Default Credentials | No API keys exposed |

### Security

- **No client-side API keys** - All AI calls go through Cloud Run
- **Rate limiting** - 10 requests/minute per IP
- **CORS protection** - Whitelisted origins only
- **ADC authentication** - Service account with minimal permissions

---

## Project Structure

```
noupick/
├── App.tsx                    # Web app main component
├── index.html                 # Web entry point
├── services/
│   └── geminiService.ts       # Frontend service (calls Cloud Run)
├── components/                # React components
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── Mascot.tsx
│   └── SlotMachine.tsx
├── functions/                 # Cloud Run backend
│   └── src/
│       ├── index.ts           # Firebase Functions entry point
│       └── cloudrun.ts        # Cloud Run production entry point
├── pablo-mobile/              # React Native mobile app
│   ├── App.tsx                # Mobile app main component
│   ├── services/
│   │   └── api.ts             # API client for Cloud Run
│   ├── app.json               # Expo/App Store config
│   └── eas.json               # EAS Build profiles
├── 000-docs/                  # Documentation
│   ├── 001-DR-STND-...        # Filing system standard
│   ├── 002-AA-AUDT-...        # DevOps playbook
│   ├── 003-DR-GUID-...        # CLI learning guide
│   └── 012-MOBILE-...         # App store deployment guide
├── firebase.json              # Firebase config
├── .firebaserc                # Firebase project aliases
└── package.json               # Dependencies
```

---

## Quick Start

### Prerequisites

- **Node.js** v20+
- **Google Cloud Project** with Vertex AI enabled (for backend)
- **Expo Go** app (for mobile testing)

### Run Web App Locally

```bash
# Clone the repo
git clone https://github.com/intent-solutions-io/No-You-Pick..git
cd No-You-Pick.

# Install dependencies
npm install

# Create .env with production API
echo "VITE_API_BASE_URL=https://noupick-api-246498703732.us-central1.run.app" > .env

# Start dev server
npm run dev
```

Open http://localhost:3000

### Run Mobile App Locally

```bash
cd pablo-mobile

# Install dependencies
npm install

# Start Expo
npx expo start

# Scan QR code with Expo Go app on your phone
```

---

## Deployment Status

### Backend API (Cloud Run)

| Item | Status |
|------|--------|
| Docker image | `us-central1-docker.pkg.dev/noupick-prod/noupick/noupick-api:latest` |
| Cloud Run service | `noupick-api` in `us-central1` |
| Vertex AI | Gemini 2.5 Flash |
| Rate limiting | 10 req/min |
| Health check | https://noupick-api-246498703732.us-central1.run.app/health |

### Web App (Firebase Hosting)

| Item | Status |
|------|--------|
| URL | https://noupick-prod.web.app |
| Firebase project | `noupick-prod` |
| Build | Vite production build |

### Mobile App (React Native)

| Item | Status |
|------|--------|
| Framework | React Native + Expo SDK 54 |
| Location | `pablo-mobile/` |
| Bundle ID (iOS) | `com.pabsai.noyoupick` |
| Package (Android) | `com.pabsai.noyoupick` |
| EAS configured | Yes |

---

## For Pablo: App Store Deployment Guide

### Step 1: Create Developer Accounts

1. **Apple Developer Program** - $99/year
   - Go to https://developer.apple.com/programs/
   - Enroll as individual or organization
   - Wait for approval (usually 24-48 hours)

2. **Google Play Console** - $25 one-time
   - Go to https://play.google.com/console
   - Pay registration fee
   - Complete account setup

### Step 2: Create Expo Account

```bash
# Create account at expo.dev, then login
cd pablo-mobile
npx eas login
```

### Step 3: Configure App Credentials

**For iOS (update `eas.json`):**
```json
{
  "submit": {
    "production": {
      "ios": {
        "appleId": "your@email.com",
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID",
        "appleTeamId": "YOUR_TEAM_ID"
      }
    }
  }
}
```

**For Android:**
- Create a service account in Google Cloud Console
- Download JSON key file
- Save as `pablo-mobile/google-services.json`

### Step 4: Create App Icons

Replace default icons in `pablo-mobile/assets/`:
- `icon.png` - 1024x1024 (app icon)
- `adaptive-icon.png` - 1024x1024 (Android adaptive)
- `splash-icon.png` - 1284x2778 (splash screen)
- `favicon.png` - 48x48 (web)

Tools: Figma, Canva, or https://icon.kitchen

### Step 5: Build for App Stores

```bash
cd pablo-mobile

# Build for iOS (requires Apple Developer account)
npx eas build --platform ios --profile production

# Build for Android (Play Store AAB)
npx eas build --platform android --profile production

# Build Android APK (for testing)
npx eas build --platform android --profile preview
```

### Step 6: Submit to Stores

```bash
# Submit to App Store (after build completes)
npx eas submit --platform ios

# Submit to Play Store (after build completes)
npx eas submit --platform android
```

### Step 7: Store Listing Content

**App Name:** No, YOU Pick!
**Subtitle:** AI Restaurant Picker
**Description:**
```
Can't decide where to eat? Let AI pick for you!

No, YOU Pick! uses AI to suggest 3 random restaurants based on your location, cuisine preferences, and search radius. Perfect for ending the "where should we eat?" debate.

Features:
- AI-powered restaurant recommendations
- 16 cuisine types to choose from
- Adjustable search radius (1-30 miles)
- One-tap Google Maps directions
- Spin Again for new picks

Stop arguing, start eating!
```

**Keywords:** restaurant picker, where to eat, food finder, AI restaurant, dinner decider

**Screenshots needed:**
- 6.7" iPhone (1290 x 2796)
- 5.5" iPhone (1242 x 2208)
- 12.9" iPad (2048 x 2732)
- Android phone (1080 x 1920)
- Android tablet (1200 x 1920)

---

## API Reference

### POST /api/restaurants

Request restaurant recommendations.

**Request:**
```json
{
  "locationQuery": "Los Angeles, CA",
  "cuisine": "Mexican",
  "radius": "10",
  "excludeNames": ["Taco Bell", "Chipotle"]
}
```

**Response:**
```json
{
  "restaurants": [
    {
      "id": "rest-0-1702234567890",
      "name": "El Cholo",
      "cuisine": "Mexican",
      "address": "1121 S Western Ave, LA",
      "rating": "4.5",
      "openStatus": "Open",
      "reason": "Classic LA Mexican since 1923, famous margaritas",
      "googleMapLink": "https://maps.google.com/..."
    }
  ],
  "rawText": "..."
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-12-10T22:00:00.000Z",
  "version": "1.0.0"
}
```

---

## Development

### Web App Commands

```bash
npm run dev        # Start dev server (port 3000)
npm run build      # Production build to dist/
npm run preview    # Preview production build
npm run typecheck   # Type check
```

### Mobile App Commands

```bash
cd pablo-mobile
npx expo start           # Start Expo dev server
npx expo start --web     # Start web version
npx eas build --platform android --profile preview  # Build APK
npx eas build --platform ios --profile preview      # Build iOS simulator
```

### Deploy Backend

```bash
cd functions
npm run build

# Build and push Docker image
docker build -t us-central1-docker.pkg.dev/noupick-prod/noupick/noupick-api:latest .
docker push us-central1-docker.pkg.dev/noupick-prod/noupick/noupick-api:latest

# Deploy to Cloud Run
gcloud run deploy noupick-api \
  --image us-central1-docker.pkg.dev/noupick-prod/noupick/noupick-api:latest \
  --region us-central1 \
  --project noupick-prod \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLOUD_PROJECT=noupick-prod
```

### Deploy Web App

```bash
npm run build
firebase deploy --only hosting --project noupick-prod
```

---

## Testing

### API Test

```bash
curl -X POST https://noupick-api-246498703732.us-central1.run.app/api/restaurants \
  -H "Content-Type: application/json" \
  -d '{"locationQuery": "Austin, TX", "cuisine": "BBQ", "radius": "10"}'
```

### Mobile App Test

1. Install **Expo Go** on your phone
2. Run `npx expo start` in `pablo-mobile/`
3. Scan QR code
4. Test the full flow:
   - Enter location
   - Select cuisine
   - Tap "No, YOU Pick!"
   - Verify results display
   - Tap restaurant to open Maps

---

## Costs

| Service | Cost |
|---------|------|
| Cloud Run | ~$0.50-2/month (usage-based) |
| Firebase Hosting | Free tier |
| Vertex AI | ~$0.001/request |
| Apple Developer | $99/year |
| Google Play | $25 one-time |

**Total to launch:** ~$125 + minimal monthly costs

---

## Troubleshooting

### "No restaurants found"

- Try "Any" cuisine instead of specific type
- Increase radius to 15 or 30 miles
- Check if location is valid (try a major city)

### Mobile app won't connect

- Verify phone has internet connection
- Check that Cloud Run API is healthy: https://noupick-api-246498703732.us-central1.run.app/health
- Try restarting Expo Go app

### EAS build fails

- Run `npx eas whoami` to verify login
- Check `app.json` bundle ID matches developer account
- For iOS: ensure Apple Developer account is active

---

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m "Add amazing feature"`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

---

## License

Proprietary License - See LICENSE file

---

## Acknowledgments

- **Google Vertex AI** - Gemini 2.5 Flash for recommendations
- **Google Cloud Run** - Serverless backend hosting
- **Firebase** - Web app hosting
- **Expo** - React Native tooling
- **Pablo** - Co-creator and product visionary

---

<div align="center">

**Made with love by Jeremy & Pablo**

Stop arguing, start eating!

[Live App](https://noupick-prod.web.app) | [Report Bug](https://github.com/intent-solutions-io/No-You-Pick./issues) | [Request Feature](https://github.com/intent-solutions-io/No-You-Pick./issues)

</div>
