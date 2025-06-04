import { useState } from 'react'; // Import useState hook to manage component state
import { Link, useLocation } from 'react-router-dom'; // Import Link for routing and useLocation to access current URL

// Navbar component for navigation and user info display
function Navbar({ user, signOut }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false); // State to toggle mobile menu
  const location = useLocation(); // Get current location for active link highlighting

  // Check if a given path matches the current URL
  const isActive = (path) => location.pathname === path;

  return (
    <nav className="bg-white shadow-lg border-b border-gray-200">
      {/* Main container for navbar content */}
      <div className="container mx-auto px-4">
        {/* Flex row for logo, links, and user menu */}
        <div className="flex justify-between items-center py-4">
          
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            {/* Logo icon with gradient background */}
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">TM</span> {/* Logo initials */}
            </div>
            <span className="text-xl font-bold text-gray-900">TaskManager</span> {/* Logo text */}
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <Link
              to="/"
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive('/')
                  ? 'text-blue-600 bg-blue-50'
                  : 'text-gray-700 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              Dashboard
            </Link>
          </div>

          {/* User Info and Actions */}
          <div className="flex items-center space-x-4">
            {/* User info (visible on md+) */}
            <div className="hidden md:flex items-center space-x-3">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {user?.username || 'User'} {/* Display username or fallback */}
                </p>
                <p className="text-xs text-gray-500">
                  {user?.email || ''} {/* Display email or nothing */}
                </p>
              </div>
              {/* Avatar with initial */}
              <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                <span className="text-white font-medium text-sm">
                  {(user?.username || user?.email || 'U').charAt(0).toUpperCase()} {/* First letter capitalized */}
                </span>
              </div>
            </div>

            {/* Sign Out Button */}
            <button
              onClick={signOut}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Sign Out
            </button>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100"
            >
              {/* Hamburger icon */}
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden pb-4 border-t border-gray-200 mt-4 pt-4">
            <div className="flex flex-col space-y-2">
              <Link
                to="/"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive('/')
                    ? 'text-blue-600 bg-blue-50'
                    : 'text-gray-700 hover:text-blue-600 hover:bg-gray-50'
                }`}
                onClick={() => setIsMenuOpen(false)} // Close menu on click
              >
                Dashboard
              </Link>

              {/* User info in mobile view */}
              <div className="px-3 py-2 border-t border-gray-200 mt-2 pt-2">
                <p className="text-sm font-medium text-gray-900">
                  {user?.username || 'User'}
                </p>
                <p className="text-xs text-gray-500">
                  {user?.email || ''}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
