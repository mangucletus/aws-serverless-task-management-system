import { signInWithRedirect } from 'aws-amplify/auth'; // Import the signInWithRedirect function from AWS Amplify Auth for handling federated sign-in

// Login component for initiating user authentication via AWS Cognito
function Login() {
  // Async function to initiate the sign-in process
  const signIn = async () => {
    try {
      // Trigger redirect-based sign-in using Cognito as the identity provider
      await signInWithRedirect({
        provider: 'COGNITO' // Specifies Cognito as the identity provider
      });
    } catch (err) {
      // Log any errors that occur during sign-in
      console.error('Sign-in error:', err);
    }
  };

  // Render the login interface
  return (
    // Full-screen container that centers its content
    <div className="flex items-center justify-center min-h-screen">
      
      {/* Inner container for the login card */}
      <div className="bg-white p-6 rounded shadow-md">
        
        {/* Title of the login page */}
        <h2 className="text-2xl mb-4">Task Management System</h2>
        
        {/* Sign-in button */}
        <button
          onClick={signIn} // Trigger sign-in when clicked
          className="bg-blue-500 text-white px-4 py-2 rounded" // Button styling
        >
          Sign In with Cognito
        </button>
      </div>
    </div>
  );
}

// Export the Login component
export default Login;
