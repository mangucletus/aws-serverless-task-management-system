import { useState, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  Flex,
  Heading,
  Card,
  Text,
  Button,
  Image,
  Divider,
  Badge,
  Loader,
} from "@aws-amplify/ui-react";
import { Edit, User, Mail, Briefcase } from "lucide-react";
import { generateClient } from "aws-amplify/data";

const client = generateClient();

const ViewProfile = () => {
  const navigate = useNavigate();
  const { userProfile } = useOutletContext() || {};
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [taskStats, setTaskStats] = useState({
    total: 0,
    completed: 0,
  });

  useEffect(() => {
    const fetchProfile = async () => {
      if (!userProfile) return;
      
      try {
        setLoading(true);
        
        // Get detailed profile
        const { data } = await client.models.UserProfile.get({ id: userProfile.id });
        setProfile(data);
        
        // Get task stats
        if (userProfile.role === "TEAM_MEMBER") {
          const { data: tasks } = await client.models.Task.list({
            filter: {
              assignedTo: {
                id: {
                  eq: userProfile.id
                }
              }
            }
          });
          
          setTaskStats({
            total: tasks.length,
            completed: tasks.filter(task => task.status === "COMPLETED").length,
          });
        } else {
          // For admin, get total tasks created
          const { data: tasks } = await client.models.Task.list({
            filter: {
              createdBy: {
                id: {
                  eq: userProfile.id
                }
              }
            }
          });
          
          setTaskStats({
            total: tasks.length,
            completed: tasks.filter(task => task.status === "COMPLETED").length,
          });
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchProfile();
  }, [userProfile]);

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
      <Flex 
        justifyContent="space-between" 
        alignItems="center"
        direction={{ base: "column", medium: "row" }}
        gap="1rem"
      >
        <Heading level={3}>My Profile</Heading>
        
        <Button
          variation="primary"
          onClick={() => navigate("/profile/edit")}
        >
          <Flex alignItems="center" gap="0.5rem">
            <Edit size={18} />
            <Text>Edit Profile</Text>
          </Flex>
        </Button>
      </Flex>

      <Card variation="elevated" padding="2rem" backgroundColor="background.primary">
        <Flex 
          direction={{ base: "column", medium: "row" }} 
          gap="2rem"
          alignItems={{ base: "center", medium: "flex-start" }}
        >
          {/* Profile Image */}
          <Flex 
            justifyContent="center" 
            alignItems="center"
            backgroundColor="background.secondary"
            borderRadius="50%"
            width="150px"
            height="150px"
            overflow="hidden"
          >
            {profile.avatar ? (
              <Image
                src={profile.avatar}
                alt={profile.name}
                objectFit="cover"
                width="100%"
                height="100%"
              />
            ) : (
              <User size={64} color="var(--amplify-colors-neutral-60)" />
            )}
          </Flex>

          {/* Profile Details */}
          <Flex 
            direction="column" 
            gap="1rem"
            flex="1"
            alignItems={{ base: "center", medium: "flex-start" }}
          >
            <Flex
              direction={{ base: "column", medium: "row" }}
              alignItems={{ base: "center", medium: "center" }}
              gap="0.5rem"
            >
              <Heading level={4}>{profile.name}</Heading>
              <Badge variation={profile.role === "ADMIN" ? "info" : "success"}>
                {profile.role}
              </Badge>
            </Flex>

            <Flex direction="column" gap="0.75rem">
              <Flex alignItems="center" gap="0.75rem">
                <Mail size={18} color="var(--amplify-colors-primary-80)" />
                <Text>{profile.email}</Text>
              </Flex>

              {profile.position && (
                <Flex alignItems="center" gap="0.75rem">
                  <Briefcase size={18} color="var(--amplify-colors-primary-80)" />
                  <Text>{profile.position}</Text>
                </Flex>
              )}
            </Flex>
          </Flex>
        </Flex>

        <Divider marginTop="2rem" marginBottom="2rem" />

        {/* Stats */}
        <Flex 
          justifyContent="space-around" 
          gap="1rem"
          direction={{ base: "column", medium: "row" }}
        >
          <Flex 
            direction="column" 
            alignItems="center"
            gap="0.25rem"
          >
            <Text fontSize="0.875rem" color="font.secondary">
              {profile.role === "ADMIN" ? "TASKS CREATED" : "TOTAL TASKS"}
            </Text>
            <Heading level={4}>{taskStats.total}</Heading>
          </Flex>

          <Flex 
            direction="column" 
            alignItems="center"
            gap="0.25rem"
          >
            <Text fontSize="0.875rem" color="font.secondary">
              {profile.role === "ADMIN" ? "COMPLETED TASKS" : "TASKS COMPLETED"}
            </Text>
            <Heading level={4}>{taskStats.completed}</Heading>
          </Flex>

          <Flex 
            direction="column" 
            alignItems="center"
            gap="0.25rem"
          >
            <Text fontSize="0.875rem" color="font.secondary">COMPLETION RATE</Text>
            <Heading level={4}>
              {taskStats.total > 0 
                ? `${Math.round((taskStats.completed / taskStats.total) * 100)}%` 
                : "0%"}
            </Heading>
          </Flex>
        </Flex>
      </Card>
    </Flex>
  );
};

export default ViewProfile;