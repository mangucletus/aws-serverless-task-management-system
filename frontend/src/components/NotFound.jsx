import { Link, useLocation } from 'react-router-dom';

// FIXED: Enhanced NotFound component for better 404 handling
function NotFound() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full text-center">
        {/* 404 Animation */}
        <div className="mb-8">
          <div className="text-8xl font-bold text-gray-300 mb-4 animate-pulse">
            404
          </div>
          <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.467-.881-6.08-2.33m0 0l1.89-.454a11.542 11.542 0 0110.75 0l1.89.454a7.97 7.97 0 01-2.173 2.876z" />
            </svg>
          </div>
        </div>

        {/* Error Content */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Page Not Found
          </h1>
          
          <p className="text-gray-600 mb-6">
            Sorry, we couldn't find the page you're looking for. The link might be broken or the page may have been moved.
          </p>

          {/* Show current path in development */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mb-6 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Requested path:</span> 
                <code className="ml-2 bg-gray-200 px-2 py-1 rounded">{location.pathname}</code>
              </p>
              {location.search && (
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-medium">Query string:</span> 
                  <code className="ml-2 bg-gray-200 px-2 py-1 rounded">{location.search}</code>
                </p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
            <Link
              to="/"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Go to Dashboard
            </Link>
            
            <button
              onClick={() => window.history.back()}
              className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              Go Back
            </button>
            
            <button
              onClick={() => window.location.reload()}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              Refresh Page
            </button>
          </div>

          {/* Help Links */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm font-medium text-gray-900 mb-3">
              Popular Pages
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <Link
                to="/"
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                🏠 Dashboard
              </Link>
              <Link
                to="/teams"
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                👥 Teams
              </Link>
              <Link
                to="/tasks"
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                📋 Tasks
              </Link>
              <Link
                to="/profile"
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                👤 Profile
              </Link>
            </div>
          </div>
        </div>

        {/* Additional Help */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Still having trouble? Try refreshing the page or{' '}
            <button
              onClick={() => {
                if (window.confirm('This will sign you out. Continue?')) {
                  // Clear any stored authentication data
                  localStorage.clear();
                  sessionStorage.clear();
                  window.location.href = '/';
                }
              }}
              className="text-blue-600 hover:text-blue-800 underline"
            >
              signing out and back in
            </button>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default NotFound;