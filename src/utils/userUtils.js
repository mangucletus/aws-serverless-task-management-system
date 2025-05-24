import { generateClient } from "aws-amplify/data";

const client = generateClient();

/**
 * Get the current user's profile including role
 * @param {object} user - The authenticated user object from Amplify
 * @returns {Promise<object>} User profile with role information
 */
export const getUserRole = async (user) => {
  if (!user) return null;
  
  try {
    // Get user's sub (unique identifier)
    const sub = user.userId;
    
    // Query for user profile based on profileOwner field
    const { data } = await client.models.UserProfile.list({
      filter: {
        profileOwner: {
          contains: sub
        }
      }
    });
    
    if (data && data.length > 0) {
      return data[0];
    }
    
    return null;
  } catch (error) {
    console.error("Error fetching user profile:", error);
    throw error;
  }
};

/**
 * Check if the current user is an admin
 * @param {object} user - The authenticated user object from Amplify
 * @returns {Promise<boolean>} True if user is admin, false otherwise
 */
export const isUserAdmin = async (user) => {
  try {
    const userProfile = await getUserRole(user);
    return userProfile?.role === "ADMIN";
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
};

/**
 * Get a user's profile by ID
 * @param {string} userId - The user's ID
 * @returns {Promise<object>} User profile
 */
export const getUserById = async (userId) => {
  try {
    const { data } = await client.models.UserProfile.get({ id: userId });
    return data;
  } catch (error) {
    console.error("Error fetching user:", error);
    throw error;
  }
};

/**
 * Get all team members (non-admin users)
 * @returns {Promise<Array>} List of team members
 */
export const getTeamMembers = async () => {
  try {
    const { data } = await client.models.UserProfile.list({
      filter: {
        role: {
          eq: "TEAM_MEMBER"
        }
      }
    });
    
    return data;
  } catch (error) {
    console.error("Error fetching team members:", error);
    throw error;
  }
};