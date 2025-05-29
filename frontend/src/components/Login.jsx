import { signInWithRedirect } from 'aws-amplify/auth';

function Login() {
  const signIn = async () => {
    try {
      await signInWithRedirect({
        provider: 'COGNITO'
      });
    } catch (err) {
      console.error('Sign-in error:', err);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="bg-white p-6 rounded shadow-md">
        <h2 className="text-2xl mb-4">Task Management System</h2>
        <button
          onClick={signIn}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Sign In with Cognito
        </button>
      </div>
    </div>
  );
}

export default Login;