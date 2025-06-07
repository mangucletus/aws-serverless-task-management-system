import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import { ThemeProvider } from '@aws-amplify/ui-react';
import App from './App.jsx';
import './index.css';
import '@aws-amplify/ui-react/styles.css';

// FIXED: Enhanced Amplify configuration with validation
const validateEnvVars = () => {
  const requiredVars = [
    'VITE_COGNITO_USER_POOL_ID',
    'VITE_COGNITO_CLIENT_ID', 
    'VITE_REGION',
    'VITE_COGNITO_DOMAIN',
    'VITE_APPSYNC_ENDPOINT'
  ];
  
  const missing = requiredVars.filter(varName => !import.meta.env[varName]);
  
  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing);
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
  
  console.log('Environment variables validated successfully');
};

// Validate environment variables
try {
  validateEnvVars();
} catch (error) {
  console.error('Environment validation failed:', error);
  // Display error to user in development
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

// FIXED: Enhanced Amplify configuration with better error handling
const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
      region: import.meta.env.VITE_REGION,
      signUpVerificationMethod: 'code',
      loginWith: {
        oauth: {
          domain: `${import.meta.env.VITE_COGNITO_DOMAIN}.auth.${import.meta.env.VITE_REGION}.amazoncognito.com`,
          scopes: ['email', 'openid', 'profile'],
          redirectSignIn: [
            window.location.origin,
            `${window.location.origin}/`,
            'http://localhost:5173',
            'http://localhost:5173/'
          ],
          redirectSignOut: [
            window.location.origin,
            `${window.location.origin}/`,
            'http://localhost:5173',
            'http://localhost:5173/'
          ],
          responseType: 'code'
        },
        username: true,
        email: true
      }
    }
  },
  API: {
    GraphQL: {
      endpoint: import.meta.env.VITE_APPSYNC_ENDPOINT,
      region: import.meta.env.VITE_REGION,
      defaultAuthMode: 'userPool'
    }
  }
};

// Configure Amplify with error handling
try {
  Amplify.configure(amplifyConfig);
  console.log('Amplify configured successfully');
  
  // Log configuration in development for debugging
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

// FIXED: Enhanced custom theme for Amplify UI with better accessibility
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
        variable: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        static: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      }
    },
    components: {
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
      button: {
        primary: {
          backgroundColor: '{colors.brand.primary.80}',
          borderRadius: '8px',
          borderWidth: '0px'
        }
      },
      fieldcontrol: {
        borderRadius: '8px',
        borderWidth: '1px'
      }
    }
  }
};

// FIXED: Enhanced error boundary for better error handling
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 text-center mb-2">
              Something went wrong
            </h1>
            <p className="text-gray-600 text-center mb-4">
              We're sorry, but there was an error loading the application.
            </p>
            {import.meta.env.DEV && (
              <details className="mb-4">
                <summary className="text-sm text-gray-500 cursor-pointer">Error Details</summary>
                <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
                  {this.state.error?.toString()}
                </pre>
              </details>
            )}
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

    return this.props.children;
  }
}

// Render the application
const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider theme={theme}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);