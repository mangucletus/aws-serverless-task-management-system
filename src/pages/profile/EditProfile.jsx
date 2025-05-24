import { useState, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  Flex,
  Heading,
  Card,
  TextField,
  Button,
  Image,
  Divider,
  Text,
  Loader,
} from "@aws-amplify/ui-react";
import { ChevronLeft, Upload, User } from "lucide-react";
import { generateClient } from "aws-amplify/data";
import { toast } from "react-toastify";

const client = generateClient();

const EditProfile = () => {
  const navigate = useNavigate();
  const { userProfile } = useOutletContext() || {};
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [formState, setFormState] = useState({
    name: "",
    position: "",
    avatar: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!userProfile) return;
      
      try {
        setLoading(true);
        
        // Get detailed profile
        const { data } = await client.models.UserProfile.get({ id: userProfile.id });
        setProfile(data);
        
        setFormState({
          name: data.name || "",
          position: data.position || "",
          avatar: data.avatar || "",
        });
      } catch (error) {
        console.error("Error fetching profile:", error);
        toast.error("Failed to load profile");
      } finally {
        setLoading(false);
      }
    };
    
    fetchProfile();
  }, [userProfile]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setIsSubmitting(true);
      
      // Update profile
      await client.models.UserProfile.update({
        id: profile.id,
        name: formState.name,
        position: formState.position,
        avatar: formState.avatar,
      });
      
      toast.success("Profile updated successfully");
      navigate("/profile/view");
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <Loader variation="linear" />;
  }

  if (!profile) {
    return (
      <Text>Profile not found. Please try again later.</Text>
    );
  }

  return (
    <Flex direction="column" gap="2rem">
      <Flex alignItems="center" gap="0.5rem">
        <Button
          variation="link"
          onClick={() => navigate("/profile/view")}
          padding="0"
        >
          <ChevronLeft size={20} />
        </Button>
        <Heading level={3}>Edit Profile</Heading>
      </Flex>

      <Card variation="elevated" padding="2rem" backgroundColor="background.primary">
        <form onSubmit={handleSubmit}>
          <Flex direction="column" gap="2rem">
            {/* Profile Image */}
            <Flex 
              direction="column" 
              alignItems="center"
              gap="1rem"
            >
              <Flex 
                justifyContent="center" 
                alignItems="center"
                backgroundColor="background.secondary"
                borderRadius="50%"
                width="150px"
                height="150px"
                overflow="hidden"
              >
                {formState.avatar ? (
                  <Image
                    src={formState.avatar}
                    alt={profile.name}
                    objectFit="cover"
                    width="100%"
                    height="100%"
                  />
                ) : (
                  <User size={64} color="var(--amplify-colors-neutral-60)" />
                )}
              </Flex>
              
              <Flex direction="column" alignItems="center" gap="0.5rem">
                <Text fontSize="0.875rem" color="font.secondary">
                  Profile Picture
                </Text>
                <TextField
                  name="avatar"
                  placeholder="Enter image URL"
                  value={formState.avatar}
                  onChange={handleChange}
                  size="small"
                  width="100%"
                />
                <Text fontSize="0.75rem" color="font.tertiary">
                  Enter a URL for your profile picture
                </Text>
              </Flex>
            </Flex>

            <Divider />

            {/* Profile Details */}
            <Flex direction="column" gap="1.5rem">
              <TextField
                label="Name"
                name="name"
                placeholder="Enter your name"
                value={formState.name}
                onChange={handleChange}
                isRequired={true}
              />

              <TextField
                label="Email"
                value={profile.email}
                isDisabled={true}
                descriptiveText="Email cannot be changed"
              />

              <TextField
                label="Position"
                name="position"
                placeholder="Enter your position"
                value={formState.position}
                onChange={handleChange}
              />
            </Flex>

            <Divider />

            <Flex 
              justifyContent="space-between"
              direction={{ base: "column", medium: "row" }}
              gap="1rem"
            >
              <Button
                onClick={() => navigate("/profile/view")}
                variation="link"
                type="button"
              >
                Cancel
              </Button>
              
              <Button
                type="submit"
                variation="primary"
                isLoading={isSubmitting}
                loadingText="Saving..."
              >
                Save Changes
              </Button>
            </Flex>
          </Flex>
        </form>
      </Card>
    </Flex>
  );
};

export default EditProfile;