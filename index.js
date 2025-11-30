// Ensure native entrypoint registers the app even if TypeScript entry isn't picked up
import { registerRootComponent } from 'expo';

// Use require to load the compiled/transpiled App module at runtime
const App = require('./App').default;

registerRootComponent(App);
