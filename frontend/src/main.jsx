// Import React core library
import React from 'react';
// Import the ReactDOM client for rendering the app into the DOM
import ReactDOM from 'react-dom/client';
// Import BrowserRouter to enable client-side routing
import { BrowserRouter } from 'react-router-dom';
// Import Amplify core configuration library
import { Amplify } from 'aws-amplify';
// Import Amplify UI ThemeProvider to apply custom styles
import { ThemeProvider } from '@aws-amplify/ui-react';
// Import the main App component
import App from './App.jsx';
// Import global styles
import './index.css';
// Import Amplify UI default styles
import '@aws-amplify/ui-react/styles.css';

// -----------------------------------------
// FIXED: Enhanced Amplify configuration with validation
// Function to validate required environment variables
const validateEnvVars = () => {
  const requiredVars = [
    'VITE_COGNITO_USER_POOL_ID',
    'VITE_COGNITO_CLIENT_ID', 
    'VITE_REGION',
    'VITE_COGNITO_DOMAIN',
    'VITE_APPSYNC_ENDPOINT'
  ];
  
  // Filter out any missing variables from the list
  const missing = requiredVars.filter(varName => !import.meta.env[varName]);
  
  // If any required variables are missing, throw an error
  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing);
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  // Log success if all variables are present
  console.log('Environment variables validated successfully');
};

// Validate environment variables on startup
try {
  validateEnvVars();
} catch (error) {
  console.error('Environment validation failed:', error);

  // In development, display the error message directly on the page
  if (import.meta.env.DEV) {
    document.body.innerHTML = `
      <div style="padding: 20px; color: red; font-family: monospace;">
        <h2>Configuration Error</h2>
        <p>${error.message}</p>
        <p>Please check your .env file and ensure all required variables are set.</p>
      </div>
    `;
  }
}

// -----------------------------------------
// FIXED: Enhanced Amplify configuration with better error handling
// Define the configuration object for Amplify
const amplifyConfig = {
  Auth: {
    Cognito: {
      // Cognito user pool ID from environment variable
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
      // Cognito app client ID from environment variable
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
      // AWS region where Cognito and AppSync are hosted
      region: import.meta.env.VITE_REGION,
      // Verification method for new sign-ups
      signUpVerificationMethod: 'code',
      // Authentication options (OAuth, username, email)
      loginWith: {
        oauth: {
          // Constructed domain for Cognito-hosted UI
          domain: `${import.meta.env.VITE_COGNITO_DOMAIN}.auth.${import.meta.env.VITE_REGION}.amazoncognito.com`,
          // Scopes for OAuth
          scopes: ['email', 'openid', 'profile'],
          // Redirect URLs after sign-in
          redirectSignIn: [
            window.location.origin,
            `${window.location.origin}/`,
            'http://localhost:5173',
            'http://localhost:5173/'
          ],
          // Redirect URLs after sign-out
          redirectSignOut: [
            window.location.origin,
            `${window.location.origin}/`,
            'http://localhost:5173',
            'http://localhost:5173/'
          ],
          // OAuth response type
          responseType: 'code'
        },
        // Enable login with username and email
        username: true,
        email: true
      }
    }
  },
  API: {
    GraphQL: {
      // AppSync GraphQL endpoint from environment variable
      endpoint: import.meta.env.VITE_APPSYNC_ENDPOINT,
      // AWS region for the AppSync API
      region: import.meta.env.VITE_REGION,
      // Use Cognito User Pools as the default auth mode
      defaultAuthMode: 'userPool'
    }
  }
};

// Try configuring Amplify with the defined settings
try {
  Amplify.configure(amplifyConfig);
  console.log('Amplify configured successfully');
  
  // In development mode, log config details for debugging
  if (import.meta.env.DEV) {
    console.log('Amplify configuration:', {
      region: import.meta.env.VITE_REGION,
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
      clientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
      domain: import.meta.env.VITE_COGNITO_DOMAIN,
      endpoint: import.meta.env.VITE_APPSYNC_ENDPOINT
    });
  }
} catch (error) {
  console.error('Failed to configure Amplify:', error);
  throw error;
}

// -----------------------------------------
// FIXED: Enhanced custom theme for Amplify UI with better accessibility
// Custom theme definition for the Amplify UI components
const theme = {
  name: 'task-management-theme',
  tokens: {
    colors: {
      brand: {
        primary: {
          10: '#EBF8FF',
          20: '#BEE3F8', 
          40: '#63B3ED',
          60: '#3182CE',
          80: '#2B77CB',
          90: '#2C5282',
          100: '#1A365D'
        }
      },
      background: {
        primary: '#FFFFFF',
        secondary: '#F7FAFC'
      },
      font: {
        primary: '#1A202C',
        secondary: '#4A5568'
      }
    },
    fonts: {
      default: {
        // System font stack for better performance and accessibility
        variable: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        static: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      }
    },
    components: {
      // Custom styles for the Authenticator component
      authenticator: {
        router: {
          boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
          borderWidth: '0px',
          borderRadius: '12px'
        },
        form: {
          padding: '2rem'
        }
      },
      // Custom styles for buttons
      button: {
        primary: {
          backgroundColor: '{colors.brand.primary.80}',
          borderRadius: '8px',
          borderWidth: '0px'
        }
      },
      // Custom styles for form field controls
      fieldcontrol: {
        borderRadius: '8px',
        borderWidth: '1px'
      }
    }
  }
};

// -----------------------------------------
// FIXED: Enhanced error boundary for better error handling
// Custom error boundary component to catch and render fallback UI on errors
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  // Update state when an error is encountered
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  // Log error information to the console
  componentDidCatch(error, errorInfo) {
    console.error('App Error Boundary caught an error:', error, errorInfo);
  }

  // Render fallback UI when an error occurs
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
            {/* Error icon */}
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            {/* Error message */}
            <h1 className="text-xl font-semibold text-gray-900 text-center mb-2">
              Something went wrong
            </h1>
            <p className="text-gray-600 text-center mb-4">
              We're sorry, but there was an error loading the application.
            </p>
            {/* Show error details in development */}
            {import.meta.env.DEV && (
              <details className="mb-4">
                <summary className="text-sm text-gray-500 cursor-pointer">Error Details</summary>
                <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
                  {this.state.error?.toString()}
                </pre>
              </details>
            )}
            {/* Buttons to reload or retry */}
            <div className="flex space-x-3">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Reload Page
              </button>
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="flex-1 bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    // If no error, render children components normally
    return this.props.children;
  }
}

// -----------------------------------------
// Render the application using React 18+ root API
const root = ReactDOM.createRoot(document.getElementById('root'));

// Render app with context providers
root.render(
  <React.StrictMode>
    <ErrorBoundary> {/* Wrap app in error boundary */}
      <ThemeProvider theme={theme}> {/* Apply custom Amplify UI theme */}
        <BrowserRouter> {/* Enable React Router for client-side navigation */}
          <App /> {/* Main app component */}
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
