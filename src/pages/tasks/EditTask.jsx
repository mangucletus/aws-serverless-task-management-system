import { useState, useEffect } from "react";
import { useNavigate, useParams, useOutletContext } from "react-router-dom";
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
  Loader,
  Alert,
} from "@aws-amplify/ui-react";
import { ChevronLeft } from "lucide-react";
import { generateClient } from "aws-amplify/data";
import { toast } from "react-toastify";

const client = generateClient();

const EditTask = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userProfile } = useOutletContext() || {};
  const [task, setTask] = useState(null);
  const [formState, setFormState] = useState({
    title: "",
    description: "",
    status: "",
    priority: "",
    deadline: new Date(),
    location: "",
    assignedToId: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState([]);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check if user is admin
    if (userProfile && userProfile.role !== "ADMIN") {
      navigate("/");
      return;
    }

    const fetchData = async () => {
      try {
        setIsLoading(true);
        
        // Fetch task
        const { data: taskData } = await client.models.Task.get({ id });
        
        if (!taskData) {
          setError("Task not found");
          return;
        }
        
        setTask(taskData);
        
        // Set form state
        setFormState({
          title: taskData.title,
          description: taskData.description,
          status: taskData.status,
          priority: taskData.priority,
          deadline: new Date(taskData.deadline),
          location: taskData.location || "",
          assignedToId: taskData.assignedTo.id,
        });
        
        // Fetch team members
        const { data: members } = await client.models.UserProfile.list({
          filter: {
            role: {
              eq: "TEAM_MEMBER"
            }
          }
        });
        setTeamMembers(members);
      } catch (error) {
        console.error("Error fetching data:", error);
        setError("Failed to load task data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id, userProfile, navigate]);

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
    } else if (new Date(formState.deadline) < new Date() && formState.status !== "COMPLETED") {
      newErrors.deadline = "Deadline cannot be in the past for incomplete tasks";
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
      
      // Check if assigned team member changed
      const isAssigneeChanged = task.assignedTo.id !== formState.assignedToId;
      
      // Update the task
      const { data: updatedTask } = await client.models.Task.update({
        id: task.id,
        title: formState.title,
        description: formState.description,
        status: formState.status,
        priority: formState.priority,
        deadline: new Date(formState.deadline).toISOString(),
        location: formState.location || null,
        assignedTo: { id: formState.assignedToId },
      });
      
      // If assignee changed, create notification for the new assignee
      if (isAssigneeChanged) {
        await client.models.Notification.create({
          message: `You have been assigned to task: "${formState.title}"`,
          type: "ASSIGNMENT",
          isRead: false,
          user: { id: formState.assignedToId },
          task: { id: task.id }
        });
      }
      
      toast.success("Task updated successfully");
      navigate(`/tasks/view/${task.id}`);
    } catch (error) {
      console.error("Error updating task:", error);
      toast.error("Failed to update task");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <Loader variation="linear" />;
  }

  if (error) {
    return (
      <Alert variation="error">
        <Heading level={5}>{error}</Heading>
        <Button onClick={() => navigate(-1)}>Go Back</Button>
      </Alert>
    );
  }

  return (
    <Flex direction="column" gap="2rem">
      <Flex alignItems="center" gap="0.5rem">
        <Button
          variation="link"
          onClick={() => navigate(`/tasks/view/${id}`)}
          padding="0"
        >
          <ChevronLeft size={20} />
        </Button>
        <Heading level={4}>Edit Task</Heading>
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
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
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
                onClick={() => navigate(`/tasks/view/${id}`)}
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

export default EditTask;