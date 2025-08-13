# Elastic UI (EUI) + React 18 Setup Guide

## 🎯 What We Learned: The Complete Working Setup

Based on debugging real-world issues with EUI v106.3.0 and React 18.2.0, here's the **exact** setup that works without errors.

---

## ⚠️ Common Mistakes to Avoid

### ❌ **DON'T DO THIS:**
```jsx
// WRONG - These CSS files don't exist in EUI v106+
import '@elastic/eui/dist/eui_theme_light.min.css'
import '@elastic/eui/dist/eui_theme_dark.min.css'

// WRONG - This syntax causes React error #130
<EuiProvider theme={{ colorMode: 'dark' }}>

// WRONG - Over-configuration that can cause conflicts
<EuiProvider 
  theme={{ colorMode: 'dark' }}
  globalStyles={true} 
  utilityClasses={true}
>
```

---

## ✅ **Correct Setup**

### 1. **Dependencies (package.json)**
```json
{
  "dependencies": {
    "@elastic/eui": "106.3.0",
    "@emotion/react": "^11.11.4",
    "@emotion/css": "^11.13.0",
    "@floating-ui/react": "^0.26.19",
    "react": "18.2.0",
    "react-dom": "18.2.0"
  }
}
```

**Key Points:**
- EUI v106+ uses **Emotion** for CSS-in-JS (no separate CSS imports needed)
- `@emotion/react` and `@emotion/css` are **required** dependencies
- `@floating-ui/react` is needed for EUI component positioning

### 2. **Main Entry Point (main.jsx)**
```jsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import { EuiProvider } from '@elastic/eui'
import App from './ui/App'

// EUI v106 uses Emotion for CSS-in-JS - no separate CSS imports needed

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <EuiProvider colorMode="dark">
      <App />
    </EuiProvider>
  </React.StrictMode>
)
```

**Key Points:**
- ✅ Use `colorMode="dark"` or `colorMode="light"` (simple string)
- ✅ No CSS imports needed - Emotion handles everything
- ✅ React 18's `createRoot` API
- ✅ Simple, clean configuration

### 3. **Webpack Configuration for EUI**
```javascript
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: path.resolve(__dirname, 'src/main.jsx'),
  resolve: {
    extensions: ['.js', '.jsx'],
    // Node.js polyfills for browser compatibility
    fallback: {
      "process": require.resolve("process/browser"),
      "buffer": require.resolve("buffer"),
    },
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
    new HtmlWebpackPlugin({
      template: 'public/index.html',
    }),
  ],
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react'],
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
};
```

**Required Additional Dependencies:**
```json
{
  "devDependencies": {
    "webpack": "^5.91.0",
    "webpack-cli": "^5.1.4",
    "html-webpack-plugin": "^5.6.0",
    "babel-loader": "^9.1.3",
    "@babel/core": "^7.24.7",
    "@babel/preset-env": "^7.24.7",
    "@babel/preset-react": "^7.24.7",
    "style-loader": "^4.0.0",
    "css-loader": "^7.1.2"
  },
  "dependencies": {
    "process": "^0.11.10",
    "buffer": "^6.0.3"
  }
}
```

---

## 🏗️ **Complete Working Project Structure**

```
your-app/
├── src/
│   ├── main.jsx          # Entry point with EuiProvider
│   └── ui/
│       └── App.jsx       # Your main app component
├── public/
│   └── index.html        # HTML template
├── package.json          # Dependencies
├── webpack.config.js     # Build configuration
└── docker-compose.yml    # Optional: Docker setup
```

---

## 🐛 **Troubleshooting Common Errors**

### **React Error #130 - "Element type is invalid"**
**Cause:** Wrong EuiProvider syntax
```jsx
// ❌ This causes React error #130
<EuiProvider theme={{ colorMode: 'dark' }}>

// ✅ Use this instead
<EuiProvider colorMode="dark">
```

### **"Can't resolve '@elastic/eui/dist/eui_theme_*.css'"**
**Cause:** Trying to import non-existent CSS files
```jsx
// ❌ Don't import these - they don't exist in EUI v106+
import '@elastic/eui/dist/eui_theme_light.min.css'
import '@elastic/eui/dist/eui_theme_dark.min.css'

// ✅ EUI v106+ uses Emotion - no imports needed
import { EuiProvider } from '@elastic/eui'
```

### **"process is not defined" or "Buffer is not defined"**
**Cause:** Missing Node.js polyfills for browser
```javascript
// ✅ Add to webpack.config.js
resolve: {
  fallback: {
    "process": require.resolve("process/browser"),
    "buffer": require.resolve("buffer"),
  },
},
plugins: [
  new webpack.ProvidePlugin({
    process: 'process/browser',
    Buffer: ['buffer', 'Buffer'],
  }),
]
```

---

## 🎨 **Using EUI Components**

### **Basic Component Usage**
```jsx
import React from 'react'
import { 
  EuiButton, 
  EuiPanel, 
  EuiTitle, 
  EuiSpacer,
  EuiFlexGroup,
  EuiFlexItem 
} from '@elastic/eui'

export default function App() {
  return (
    <EuiPanel paddingSize="l">
      <EuiTitle size="l">
        <h1>My EUI App</h1>
      </EuiTitle>
      <EuiSpacer />
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiButton fill>Primary Action</EuiButton>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiButton>Secondary Action</EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  )
}
```

### **Theme Switching**
```jsx
import React, { useState } from 'react'
import { EuiProvider, EuiButton } from '@elastic/eui'

function App() {
  const [isDark, setIsDark] = useState(true)
  
  return (
    <EuiProvider colorMode={isDark ? 'dark' : 'light'}>
      <EuiButton onClick={() => setIsDark(!isDark)}>
        Switch to {isDark ? 'Light' : 'Dark'} Mode
      </EuiButton>
    </EuiProvider>
  )
}
```

---

## 🐳 **Docker Setup (Bonus)**

### **Dockerfile**
```dockerfile
# Multi-stage build for production
FROM node:24-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM node:24-alpine as runtime
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
USER nodejs
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"
CMD ["node", "server/index.js"]
```

---

## 📝 **Build Scripts**

### **package.json scripts**
```json
{
  "scripts": {
    "dev": "webpack serve --mode development --open",
    "build": "webpack --mode production",
    "build:watch": "webpack --watch --mode development",
    "start": "node server/index.js"
  }
}
```

---

## ⚡ **Performance Tips**

1. **Import only what you need:**
   ```jsx
   // ✅ Good - tree shaking works
   import { EuiButton, EuiPanel } from '@elastic/eui'
   
   // ❌ Bad - imports entire library
   import * as EUI from '@elastic/eui'
   ```

2. **Use code splitting for large EUI imports:**
   ```jsx
   // For components used conditionally
   const EuiModal = React.lazy(() => 
     import('@elastic/eui').then(module => ({ default: module.EuiModal }))
   )
   ```

---

## 🔗 **Official Resources**

- [EUI Documentation](https://eui.elastic.co/)
- [EUI Components](https://eui.elastic.co/docs/components)
- [EUI GitHub](https://github.com/elastic/eui)
- [React 18 Documentation](https://react.dev/)

---

## ✅ **Checklist for New EUI + React 18 Project**

- [ ] Install correct dependencies (`@elastic/eui`, `@emotion/react`, `@emotion/css`)
- [ ] Set up EuiProvider with simple `colorMode` prop (no theme object)
- [ ] Configure webpack with Node.js polyfills if needed
- [ ] Use React 18's `createRoot` API
- [ ] Import only specific EUI components you need
- [ ] Test in development mode first
- [ ] Build and test production bundle
- [ ] Verify no console errors in browser

---

*Generated from real debugging experience - August 2025* 🚀
