import { useState, useEffect } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import {
  Flex,
  Heading,
  Text,
  Badge,
  Card,
  Button,
  TextAreaField,
  SelectField,
  View,
  Divider,
  Loader,
  Alert,
} from "@aws-amplify/ui-react";
import {
  Calendar,
  Clock,
  MapPin,
  Edit,
  Trash2,
  User,
  ChevronLeft,
  MessageSquare,
} from "lucide-react";
import { generateClient } from "aws-amplify/data";
import { formatDate, getDaysUntilDeadline } from "../../utils/dateUtils";
import { toast } from "react-toastify";

const client = generateClient();

const TaskDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userProfile } = useOutletContext() || {};
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [note, setNote] = useState("");
  const [statusUpdate, setStatusUpdate] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTask = async () => {
      try {
        setLoading(true);
        const { data: taskData } = await client.models.Task.get({ id });
        
        if (!taskData) {
          setError("Task not found");
          return;
        }
        
        // Get task creator and assignee
        const { data: creator } = await client.models.UserProfile.get({ 
          id: taskData.createdBy.id 
        });
        
        const { data: assignee } = await client.models.UserProfile.get({ 
          id: taskData.assignedTo.id 
        });
        
        setTask({
          ...taskData,
          createdBy: creator,
          assignedTo: assignee
        });
        
        if (taskData.notes) {
          setNote(taskData.notes);
        }
        
        setStatusUpdate(taskData.status);
      } catch (error) {
        console.error("Error fetching task:", error);
        setError("Error loading task");
      } finally {
        setLoading(false);
      }
    };
    
    fetchTask();
  }, [id]);

  const updateTaskStatus = async () => {
    if (statusUpdate === task.status) {
      return;
    }
    
    try {
      setIsUpdating(true);
      
      // Update task
      const { data: updatedTask } = await client.models.Task.update({
        id: task.id,
        status: statusUpdate
      });
      
      // Create notification for admin
      await client.models.Notification.create({
        message: `Task "${task.title}" status changed to ${statusUpdate.replace('_', ' ')}`,
        type: "STATUS_CHANGE",
        isRead: false,
        user: { id: task.createdBy.id },
        task: { id: task.id }
      });
      
      setTask({
        ...task,
        status: statusUpdate
      });
      
      toast.success("Task status updated successfully");
    } catch (error) {
      console.error("Error updating task status:", error);
      toast.error("Failed to update task status");
    } finally {
      setIsUpdating(false);
    }
  };

  const updateTaskNotes = async () => {
    if (note === task.notes) {
      return;
    }
    
    try {
      setIsUpdating(true);
      
      // Update task
      const { data: updatedTask } = await client.models.Task.update({
        id: task.id,
        notes: note
      });
      
      setTask({
        ...task,
        notes: note
      });
      
      toast.success("Notes updated successfully");
    } catch (error) {
      console.error("Error updating notes:", error);
      toast.error("Failed to update notes");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this task?")) {
      return;
    }
    
    try {
      setIsUpdating(true);
      
      // Delete task
      await client.models.Task.delete({ id: task.id });
      
      toast.success("Task deleted successfully");
      navigate("/admin/dashboard");
    } catch (error) {
      console.error("Error deleting task:", error);
      toast.error("Failed to delete task");
    } finally {
      setIsUpdating(false);
    }
  };

  if (loading) {
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

  const isAdmin = userProfile?.role === "ADMIN";
  const isAssignee = userProfile?.id === task?.assignedTo?.id;
  const canEdit = isAdmin;
  const canUpdateStatus = isAdmin || isAssignee;
  const canAddNotes = isAdmin || isAssignee;

  const priorityColors = {
    HIGH: "#ef4444",
    MEDIUM: "#f97316",
    LOW: "#3b82f6",
  };

  const statusVariation = {
    PENDING: "warning",
    IN_PROGRESS: "info",
    COMPLETED: "success",
    CANCELLED: "neutral",
  };

  return (
    <Flex direction="column" gap="2rem">
      <Flex alignItems="center" gap="0.5rem">
        <Button
          variation="link"
          onClick={() => navigate(-1)}
          padding="0"
        >
          <ChevronLeft size={20} />
        </Button>
        <Heading level={4}>Task Details</Heading>
      </Flex>

      <Card variation="elevated" padding="2rem" backgroundColor="background.primary">
        <Flex direction="column" gap="1.5rem">
          {/* Header with actions */}
          <Flex 
            justifyContent="space-between" 
            alignItems="flex-start"
            direction={{ base: "column", medium: "row" }}
            gap="1rem"
          >
            <Flex direction="column" gap="0.5rem">
              <Heading level={3}>{task.title}</Heading>
              <Flex gap="0.75rem" alignItems="center">
                <Badge variation={statusVariation[task.status]}>
                  {task.status.replace("_", " ")}
                </Badge>
                <Flex alignItems="center" gap="0.25rem">
                  <View
                    width="0.75rem"
                    height="0.75rem"
                    backgroundColor={priorityColors[task.priority]}
                    borderRadius="50%"
                  />
                  <Text fontSize="0.875rem" color="font.secondary">
                    {task.priority} Priority
                  </Text>
                </Flex>
              </Flex>
            </Flex>

            {canEdit && (
              <Flex gap="0.5rem">
                <Button
                  onClick={() => navigate(`/tasks/edit/${task.id}`)}
                  variation="primary"
                  size="small"
                >
                  <Flex alignItems="center" gap="0.25rem">
                    <Edit size={16} />
                    <Text>Edit</Text>
                  </Flex>
                </Button>
                <Button
                  onClick={handleDelete}
                  variation="destructive"
                  size="small"
                  isLoading={isUpdating}
                >
                  <Flex alignItems="center" gap="0.25rem">
                    <Trash2 size={16} />
                    <Text>Delete</Text>
                  </Flex>
                </Button>
              </Flex>
            )}
          </Flex>

          <Divider />

          {/* Task details */}
          <Flex 
            direction={{ base: "column", large: "row" }}
            gap="2rem"
          >
            <Flex 
              direction="column" 
              gap="1.5rem"
              flex="3"
            >
              <Flex direction="column" gap="0.5rem">
                <Heading level={6}>Description</Heading>
                <Text>{task.description}</Text>
              </Flex>

              <Flex wrap="wrap" gap="1.5rem">
                <Flex direction="column" gap="0.25rem">
                  <Text fontSize="0.75rem" color="font.secondary">DEADLINE</Text>
                  <Flex alignItems="center" gap="0.5rem">
                    <Calendar size={16} />
                    <Text>{formatDate(task.deadline)}</Text>
                  </Flex>
                </Flex>

                {task.location && (
                  <Flex direction="column" gap="0.25rem">
                    <Text fontSize="0.75rem" color="font.secondary">LOCATION</Text>
                    <Flex alignItems="center" gap="0.5rem">
                      <MapPin size={16} />
                      <Text>{task.location}</Text>
                    </Flex>
                  </Flex>
                )}

                <Flex direction="column" gap="0.25rem">
                  <Text fontSize="0.75rem" color="font.secondary">TIME REMAINING</Text>
                  <Flex alignItems="center" gap="0.5rem">
                    <Clock size={16} />
                    <Text
                      color={
                        task.status === "COMPLETED" ? "font.secondary" :
                        getDaysUntilDeadline(task.deadline) <= 1 ? "error.80" :
                        getDaysUntilDeadline(task.deadline) <= 3 ? "warning.80" :
                        "font.primary"
                      }
                    >
                      {task.status === "COMPLETED" ? "Completed" :
                       getDaysUntilDeadline(task.deadline) === 0 ? "Due today" :
                       getDaysUntilDeadline(task.deadline) === 1 ? "Due tomorrow" :
                       `${getDaysUntilDeadline(task.deadline)} days left`}
                    </Text>
                  </Flex>
                </Flex>
              </Flex>

              {/* Notes section */}
              <Flex direction="column" gap="1rem">
                <Heading level={6}>Notes</Heading>
                {canAddNotes ? (
                  <Flex direction="column" gap="0.5rem">
                    <TextAreaField
                      label=""
                      placeholder="Add notes or comments about this task..."
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={4}
                    />
                    <Flex justifyContent="flex-end">
                      <Button
                        onClick={updateTaskNotes}
                        variation="primary"
                        size="small"
                        isDisabled={note === task.notes}
                        isLoading={isUpdating}
                      >
                        <Flex alignItems="center" gap="0.25rem">
                          <MessageSquare size={16} />
                          <Text>Save Notes</Text>
                        </Flex>
                      </Button>
                    </Flex>
                  </Flex>
                ) : (
                  <Text>
                    {task.notes || "No notes added yet."}
                  </Text>
                )}
              </Flex>
            </Flex>

            {/* Sidebar */}
            <Flex
              direction="column"
              gap="1.5rem"
              flex="1"
              backgroundColor="background.secondary"
              padding="1.5rem"
              borderRadius="medium"
            >
              <Flex direction="column" gap="0.5rem">
                <Text fontSize="0.75rem" color="font.secondary">ASSIGNED TO</Text>
                <Flex alignItems="center" gap="0.5rem">
                  <User size={16} />
                  <Text>{task.assignedTo?.name || "Unknown"}</Text>
                </Flex>
              </Flex>

              <Flex direction="column" gap="0.5rem">
                <Text fontSize="0.75rem" color="font.secondary">CREATED BY</Text>
                <Flex alignItems="center" gap="0.5rem">
                  <User size={16} />
                  <Text>{task.createdBy?.name || "Unknown"}</Text>
                </Flex>
              </Flex>

              {canUpdateStatus && (
                <>
                  <Divider />
                  <Flex direction="column" gap="1rem">
                    <Text fontSize="0.875rem" fontWeight="bold">Update Status</Text>
                    <SelectField
                      label=""
                      value={statusUpdate}
                      onChange={(e) => setStatusUpdate(e.target.value)}
                    >
                      <option value="PENDING">Pending</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="COMPLETED">Completed</option>
                      {isAdmin && <option value="CANCELLED">Cancelled</option>}
                    </SelectField>
                    <Button
                      onClick={updateTaskStatus}
                      variation="primary"
                      isDisabled={statusUpdate === task.status}
                      isLoading={isUpdating}
                    >
                      Update Status
                    </Button>
                  </Flex>
                </>
              )}
            </Flex>
          </Flex>
        </Flex>
      </Card>
    </Flex>
  );
};

export default TaskDetails;