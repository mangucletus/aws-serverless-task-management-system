function ErrorMessage({ message, onDismiss, type = 'error' }) {
  // Defines the ErrorMessage component
  // Props:
  // - message: string to display
  // - onDismiss: optional callback function to dismiss the message
  // - type: the type of message (e.g., 'error', 'warning', 'success'); defaults to 'error'

  // Configuration object defining styles and icons for each message type
  const typeConfig = {
    error: {
      bgColor: 'bg-red-50',          // Light red background
      borderColor: 'border-red-200', // Red border
      textColor: 'text-red-800',     // Dark red text
      iconColor: 'text-red-400',     // Medium red icon color
      icon: (
        // SVG icon representing an error (alert circle)
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    warning: {
      bgColor: 'bg-yellow-50',         
      borderColor: 'border-yellow-200',
      textColor: 'text-yellow-800',
      iconColor: 'text-yellow-400',
      icon: (
        // SVG icon representing a warning (triangle)
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.502 0L4.232 19.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      )
    },
    success: {
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      textColor: 'text-green-800',
      iconColor: 'text-green-400',
      icon: (
        // SVG icon representing success (checkmark)
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )
    }
  };

  // Use the appropriate config based on the message type
  const config = typeConfig[type] || typeConfig.error;

  return (
    // Outer container with background and border styling
    <div className={`${config.bgColor} ${config.borderColor} border rounded-lg p-4`}>
      {/* Flex container to align icon, message, and optional dismiss button */}
      <div className="flex items-start">
        {/* Icon container */}
        <div className={`${config.iconColor} mr-3 mt-0.5`}>
          {config.icon}
        </div>
        {/* Message text */}
        <div className="flex-1">
          <p className={`${config.textColor} text-sm font-medium`}>
            {message}
          </p>
        </div>
        {/* Optional dismiss button */}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className={`${config.iconColor} hover:${config.textColor} ml-3 flex-shrink-0`}
          >
            {/* Dismiss (X) icon */}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// Export the component
export default ErrorMessage;
