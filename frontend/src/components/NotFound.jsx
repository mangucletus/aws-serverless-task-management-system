// Import React Router components for navigation and location access
import { Link, useLocation } from 'react-router-dom';

// FIXED: Enhanced NotFound component for better 404 handling
// This component displays a user-friendly 404 error page when users navigate to non-existent routes
function NotFound() {
  // Hook to access current location information (pathname, search params, etc.)
  const location = useLocation();

  return (
    // Main container with full screen height and gradient background matching app theme
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      {/* Content container with max width and centered alignment */}
      <div className="max-w-lg w-full text-center">
        
        {/* 404 Animation Section */}
        <div className="mb-8"> {/* Bottom margin for spacing from main content */}
          {/* Large animated 404 text */}
          <div className="text-8xl font-bold text-gray-300 mb-4 animate-pulse">
            404
          </div>
          {/* Icon container with circular background */}
          <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
            {/* SVG icon representing a confused/sad face or broken page */}
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {/* Path for sad/confused face icon */}
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.467-.881-6.08-2.33m0 0l1.89-.454a11.542 11.542 0 0110.75 0l1.89.454a7.97 7.97 0 01-2.173 2.876z" />
            </svg>
          </div>
        </div>

        {/* Main Error Content Card */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
          {/* Main error heading */}
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Page Not Found
          </h1>
          
          {/* Error description explaining what happened */}
          <p className="text-gray-600 mb-6">
            Sorry, we couldn't find the page you're looking for. The link might be broken or the page may have been moved.
          </p>

          {/* Development-only debug information section */}
          {/* Only shows when NODE_ENV is 'development' to help developers debug routing issues */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mb-6 p-3 bg-gray-50 rounded-lg">
              {/* Display the requested pathname that caused the 404 */}
              <p className="text-sm text-gray-600">
                <span className="font-medium">Requested path:</span> 
                <code className="ml-2 bg-gray-200 px-2 py-1 rounded">{location.pathname}</code>
              </p>
              {/* Display query string if present (e.g., ?param=value) */}
              {location.search && (
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-medium">Query string:</span> 
                  <code className="ml-2 bg-gray-200 px-2 py-1 rounded">{location.search}</code>
                </p>
              )}
            </div>
          )}

          {/* Action Buttons Section */}
          {/* Responsive flex layout: column on mobile, row on larger screens */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
            {/* Primary action: Navigate to dashboard/home page */}
            <Link
              to="/" // Navigate to root/dashboard route
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Go to Dashboard
            </Link>
            
            {/* Secondary action: Use browser's back functionality */}
            <button
              onClick={() => window.history.back()} // Go to previous page in browser history
              className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              Go Back
            </button>
            
            {/* Tertiary action: Refresh current page (might resolve temporary issues) */}
            <button
              onClick={() => window.location.reload()} // Reload the current page
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              Refresh Page
            </button>
          </div>

          {/* Help Links Section */}
          <div className="border-t border-gray-200 pt-6"> {/* Top border and padding for visual separation */}
            {/* Section heading */}
            <h3 className="text-sm font-medium text-gray-900 mb-3">
              Popular Pages
            </h3>
            {/* Grid of popular/common page links */}
            {/* Responsive grid: 1 column on mobile, 2 columns on larger screens */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              {/* Dashboard link with home emoji */}
              <Link
                to="/" // Navigate to dashboard
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                🏠 Dashboard
              </Link>
              {/* Teams link with people emoji */}
              <Link
                to="/teams" // Navigate to teams page (might not exist in current routing)
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                👥 Teams
              </Link>
              {/* Tasks link with clipboard emoji */}
              <Link
                to="/tasks" // Navigate to tasks page (might not exist in current routing)
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                📋 Tasks
              </Link>
              {/* Profile link with person emoji */}
              <Link
                to="/profile" // Navigate to profile page (might not exist in current routing)
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                👤 Profile
              </Link>
            </div>
          </div>
        </div>

        {/* Additional Help Section */}
        <div className="mt-6 text-center"> {/* Top margin and centered text */}
          <p className="text-sm text-gray-500">
            Still having trouble? Try refreshing the page or{' '}
            {/* Interactive sign out button */}
            <button
              onClick={() => {
                // Show confirmation dialog before signing out
                if (window.confirm('This will sign you out. Continue?')) {
                  // Clear any stored authentication data from browser storage
                  localStorage.clear();    // Clear localStorage (user preferences, tokens, etc.)
                  sessionStorage.clear();  // Clear sessionStorage (temporary session data)
                  window.location.href = '/'; // Navigate to home page (will trigger re-authentication)
                }
              }}
              className="text-blue-600 hover:text-blue-800 underline"
            >
              signing out and back in
            </button>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

// Export the NotFound component as the default export
export default NotFound;