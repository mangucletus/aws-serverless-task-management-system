function LoadingSpinner({ message = "Loading..." }) {
  // Defines the LoadingSpinner component
  // Props:
  // - message: optional string to display below the spinner (defaults to "Loading...")

  return (
    // Full-screen container with a vertical gradient background and centered content
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      
      {/* Inner container for spinner and message, centered */}
      <div className="text-center">
        
        {/* Spinner element:
            - Inline-block circle
            - Spinning animation
            - Blue border with a transparent top border to create the spinning effect */}
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-4"></div>
        
        {/* Message text displayed below the spinner */}
        <p className="text-gray-600 font-medium">{message}</p>
      </div>
    </div>
  );
}

// Export the component
export default LoadingSpinner;
