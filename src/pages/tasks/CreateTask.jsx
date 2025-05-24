import { useState, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  Flex,
  Heading,
  Card,
  TextField,
  TextAreaField,
  SelectField,
  Button,
  DatePicker,
  Text,
  Divider,
  Badge,
  Alert,
} from "@aws-amplify/ui-react";
import { 
  ChevronLeft,
  Calendar,
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle
} from "lucide-react";
import { generateClient } from "aws-amplify/data";
import { toast } from "react-toastify";

const client = generateClient();

const CreateTask = () => {
  const navigate = useNavigate();
  const { userProfile } = useOutletContext() || {};
  const [formState, setFormState] = useState({
    title: "",
    description: "",
    status: "PENDING",
    priority: "MEDIUM",
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default to 1 week from now
    location: "",
    assignedToId: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    // Check if user is admin
    if (userProfile && userProfile.role !== "ADMIN") {
      navigate("/");
      return;
    }

    // Fetch team members
    const fetchTeamMembers = async () => {
      try {
        const { data } = await client.models.UserProfile.list({
          filter: {
            role: {
              eq: "TEAM_MEMBER"
            }
          }
        });
        setTeamMembers(data);
      } catch (error) {
        console.error("Error fetching team members:", error);
        toast.error("Failed to load team members");
      }
    };

    fetchTeamMembers();
  }, [userProfile, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
    
    // Clear error when field is updated
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formState.title.trim()) {
      newErrors.title = "Title is required";
    }
    
    if (!formState.description.trim()) {
      newErrors.description = "Description is required";
    }
    
    if (!formState.assignedToId) {
      newErrors.assignedToId = "Please select a team member";
    }
    
    if (!formState.deadline) {
      newErrors.deadline = "Deadline is required";
    } else if (new Date(formState.deadline) < new Date()) {
      newErrors.deadline = "Deadline cannot be in the past";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error("Please fix the errors in the form");
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // Create the task
      const { data: newTask } = await client.models.Task.create({
        title: formState.title,
        description: formState.description,
        status: formState.status,
        priority: formState.priority,
        deadline: new Date(formState.deadline).toISOString(),
        location: formState.location || null,
        assignedTo: { id: formState.assignedToId },
        createdBy: { id: userProfile.id },
        isNotified: false,
      });
      
      // Create notification for the assigned team member
      await client.models.Notification.create({
        message: `You have been assigned a new task: "${formState.title}"`,
        type: "ASSIGNMENT",
        isRead: false,
        user: { id: formState.assignedToId },
        task: { id: newTask.id }
      });
      
      toast.success("Task created successfully");
      navigate("/admin/dashboard");
    } catch (error) {
      console.error("Error creating task:", error);
      toast.error("Failed to create task");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Flex direction="column" gap="2rem">
      <Flex alignItems="center" gap="0.5rem">
        <Button
          variation="link"
          onClick={() => navigate("/admin/dashboard")}
          padding="0"
        >
          <ChevronLeft size={20} />
        </Button>
        <Heading level={4}>Create New Task</Heading>
      </Flex>

      <Card variation="elevated" padding="2rem" backgroundColor="background.primary">
        <form onSubmit={handleSubmit}>
          <Flex direction="column" gap="1.5rem">
            <TextField
              label="Task Title"
              name="title"
              placeholder="Enter task title"
              value={formState.title}
              onChange={handleChange}
              isRequired={true}
              hasError={!!errors.title}
              errorMessage={errors.title}
            />

            <TextAreaField
              label="Description"
              name="description"
              placeholder="Describe the task in detail..."
              rows={4}
              value={formState.description}
              onChange={handleChange}
              isRequired={true}
              hasError={!!errors.description}
              errorMessage={errors.description}
            />

            <Flex 
              direction={{ base: "column", medium: "row" }} 
              gap="1rem"
            >
              <SelectField
                label="Priority"
                name="priority"
                value={formState.priority}
                onChange={handleChange}
                flex="1"
              >
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </SelectField>

              <SelectField
                label="Status"
                name="status"
                value={formState.status}
                onChange={handleChange}
                flex="1"
              >
                <option value="PENDING">Pending</option>
                <option value="IN_PROGRESS">In Progress</option>
              </SelectField>
            </Flex>

            <Flex 
              direction={{ base: "column", medium: "row" }} 
              gap="1rem"
            >
              <SelectField
                label="Assign To"
                name="assignedToId"
                value={formState.assignedToId}
                onChange={handleChange}
                placeholder="Select team member"
                flex="1"
                isRequired={true}
                hasError={!!errors.assignedToId}
                errorMessage={errors.assignedToId}
              >
                <option value="" disabled>Select team member</option>
                {teamMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name || member.email}
                  </option>
                ))}
              </SelectField>

              <Flex direction="column" flex="1">
                <Text
                  fontSize="0.875rem"
                  color="font.secondary"
                  paddingBottom="0.25rem"
                >
                  Deadline*
                </Text>
                <DatePicker
                  name="deadline"
                  value={formState.deadline}
                  onChange={(date) => {
                    setFormState((prev) => ({ ...prev, deadline: date }));
                    if (errors.deadline) {
                      setErrors((prev) => ({ ...prev, deadline: null }));
                    }
                  }}
                  hasError={!!errors.deadline}
                  errorMessage={errors.deadline}
                />
                {errors.deadline && (
                  <Text fontSize="0.75rem" color="error.80" paddingTop="0.25rem">
                    {errors.deadline}
                  </Text>
                )}
              </Flex>
            </Flex>

            <TextField
              label="Location (Optional)"
              name="location"
              placeholder="Enter task location"
              value={formState.location}
              onChange={handleChange}
            />

            <Divider />

            <Flex 
              justifyContent="space-between"
              direction={{ base: "column", medium: "row" }}
              gap="1rem"
            >
              <Button
                onClick={() => navigate("/admin/dashboard")}
                variation="link"
                type="button"
              >
                Cancel
              </Button>
              
              <Flex gap="1rem">
                <Button
                  onClick={() => {
                    // Save as draft functionality could be added here
                    toast.info("Draft functionality not implemented yet");
                  }}
                  variation="link"
                  type="button"
                  isDisabled={isSubmitting}
                >
                  Save as Draft
                </Button>
                
                <Button
                  type="submit"
                  variation="primary"
                  isLoading={isSubmitting}
                  loadingText="Creating..."
                >
                  Create Task
                </Button>
              </Flex>
            </Flex>
          </Flex>
        </form>
      </Card>
    </Flex>
  );
};

export default CreateTask;