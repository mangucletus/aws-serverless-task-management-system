import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Flex, 
  Heading, 
  Card, 
  Text, 
  Button, 
  Badge, 
  Collection,
  Table,
  TableCell,
  TableBody,
  TableHead,
  TableRow,
  Loader,
  View
} from "@aws-amplify/ui-react";
import { 
  PlusCircle, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Calendar, 
  Users,
  BarChart2
} from "lucide-react";
import { generateClient } from "aws-amplify/data";
import { formatDate, getDaysUntilDeadline } from "../../utils/dateUtils";
import TaskStatusChart from "../../components/charts/TaskStatusChart";

const client = generateClient();

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [taskStats, setTaskStats] = useState({
    pending: 0,
    inProgress: 0,
    completed: 0,
    total: 0
  });
  const [recentTasks, setRecentTasks] = useState([]);
  const [upcomingTasks, setUpcomingTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        
        // Fetch tasks for statistics
        const { data: allTasks } = await client.models.Task.list({ 
          limit: 1000 
        });
        
        // Calculate task statistics
        const stats = {
          pending: allTasks.filter(task => task.status === "PENDING").length,
          inProgress: allTasks.filter(task => task.status === "IN_PROGRESS").length,
          completed: allTasks.filter(task => task.status === "COMPLETED").length,
          total: allTasks.length
        };
        setTaskStats(stats);
        
        // Fetch recent tasks (last 5)
        const { data: recent } = await client.models.Task.list({
          limit: 5,
          sort: { field: 'createdAt', direction: 'desc' }
        });
        setRecentTasks(recent);
        
        // Fetch upcoming deadlines
        const today = new Date();
        const { data: upcoming } = await client.models.Task.list({
          filter: {
            status: { ne: "COMPLETED" },
            deadline: { gt: today.toISOString() }
          },
          limit: 5,
          sort: { field: 'deadline', direction: 'asc' }
        });
        setUpcomingTasks(upcoming);
        
        // Fetch team members
        const { data: members } = await client.models.UserProfile.list({
          filter: { role: { eq: "TEAM_MEMBER" } },
          limit: 10
        });
        setTeamMembers(members);
        
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchDashboardData();
  }, []);

  if (loading) {
    return <Loader variation="linear" />;
  }

  return (
    <Flex direction="column" gap="2rem">
      <Flex justifyContent="space-between" alignItems="center">
        <Heading level={3}>Admin Dashboard</Heading>
        <Button 
          variation="primary"
          onClick={() => navigate("/admin/create-task")}
        >
          <Flex alignItems="center" gap="0.5rem">
            <PlusCircle size={18} />
            <Text>Create Task</Text>
          </Flex>
        </Button>
      </Flex>

      {/* Stats Cards */}
      <Flex
        direction={{ base: "column", medium: "row" }}
        gap="1rem"
        wrap="wrap"
      >
        <Card
          variation="elevated"
          flex={{ base: "1", medium: "1" }}
          padding="1rem"
          backgroundColor="background.primary"
        >
          <Flex alignItems="center" gap="1rem">
            <View
              padding="0.75rem"
              backgroundColor="primary.10"
              borderRadius="50%"
            >
              <Clock color="var(--amplify-colors-primary-90)" />
            </View>
            <Flex direction="column">
              <Text fontSize="0.875rem" color="font.secondary">Pending Tasks</Text>
              <Heading level={4} margin="0">{taskStats.pending}</Heading>
            </Flex>
          </Flex>
        </Card>

        <Card
          variation="elevated"
          flex={{ base: "1", medium: "1" }}
          padding="1rem"
          backgroundColor="background.primary"
        >
          <Flex alignItems="center" gap="1rem">
            <View
              padding="0.75rem"
              backgroundColor="#ebf5ff"
              borderRadius="50%"
            >
              <AlertCircle color="#3b82f6" />
            </View>
            <Flex direction="column">
              <Text fontSize="0.875rem" color="font.secondary">In Progress</Text>
              <Heading level={4} margin="0">{taskStats.inProgress}</Heading>
            </Flex>
          </Flex>
        </Card>

        <Card
          variation="elevated"
          flex={{ base: "1", medium: "1" }}
          padding="1rem"
          backgroundColor="background.primary"
        >
          <Flex alignItems="center" gap="1rem">
            <View
              padding="0.75rem"
              backgroundColor="#ecfdf5"
              borderRadius="50%"
            >
              <CheckCircle color="#10b981" />
            </View>
            <Flex direction="column">
              <Text fontSize="0.875rem" color="font.secondary">Completed</Text>
              <Heading level={4} margin="0">{taskStats.completed}</Heading>
            </Flex>
          </Flex>
        </Card>

        <Card
          variation="elevated"
          flex={{ base: "1", medium: "1" }}
          padding="1rem"
          backgroundColor="background.primary"
        >
          <Flex alignItems="center" gap="1rem">
            <View
              padding="0.75rem"
              backgroundColor="#f0f9ff"
              borderRadius="50%"
            >
              <Users color="#0ea5e9" />
            </View>
            <Flex direction="column">
              <Text fontSize="0.875rem" color="font.secondary">Team Members</Text>
              <Heading level={4} margin="0">{teamMembers.length}</Heading>
            </Flex>
          </Flex>
        </Card>
      </Flex>

      {/* Charts and Tables */}
      <Flex
        direction={{ base: "column", large: "row" }}
        gap="2rem"
      >
        {/* Task Status Chart */}
        <Card
          variation="elevated"
          padding="1.5rem"
          flex={{ base: "1", large: "1" }}
          backgroundColor="background.primary"
        >
          <Flex direction="column" gap="1rem">
            <Heading level={5}>Task Status Distribution</Heading>
            <View height="250px">
              <TaskStatusChart data={[
                { name: 'Pending', value: taskStats.pending, color: '#3b82f6' },
                { name: 'In Progress', value: taskStats.inProgress, color: '#f97316' },
                { name: 'Completed', value: taskStats.completed, color: '#10b981' }
              ]} />
            </View>
          </Flex>
        </Card>

        {/* Recent Tasks */}
        <Card
          variation="elevated"
          padding="1.5rem"
          flex={{ base: "1", large: "1" }}
          backgroundColor="background.primary"
        >
          <Flex direction="column" gap="1rem">
            <Flex justifyContent="space-between" alignItems="center">
              <Heading level={5}>Recent Tasks</Heading>
              <Button 
                variation="link" 
                size="small"
                onClick={() => navigate("/admin/tasks")}
              >
                View all
              </Button>
            </Flex>
            
            {recentTasks.length === 0 ? (
              <Text>No tasks created yet</Text>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell as="th">Task</TableCell>
                    <TableCell as="th">Status</TableCell>
                    <TableCell as="th">Deadline</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentTasks.map((task) => (
                    <TableRow 
                      key={task.id}
                      onClick={() => navigate(`/tasks/view/${task.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <TableCell>{task.title}</TableCell>
                      <TableCell>
                        <Badge
                          variation={
                            task.status === "COMPLETED" ? "success" :
                            task.status === "IN_PROGRESS" ? "info" : "warning"
                          }
                        >
                          {task.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(task.deadline)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Flex>
        </Card>
      </Flex>

      {/* Upcoming Deadlines */}
      <Card
        variation="elevated"
        padding="1.5rem"
        backgroundColor="background.primary"
      >
        <Flex direction="column" gap="1rem">
          <Flex justifyContent="space-between" alignItems="center">
            <Heading level={5}>
              <Flex alignItems="center" gap="0.5rem">
                <Calendar size={20} />
                <Text>Upcoming Deadlines</Text>
              </Flex>
            </Heading>
            <Button 
              variation="link" 
              size="small"
              onClick={() => navigate("/admin/tasks")}
            >
              View all
            </Button>
          </Flex>
          
          {upcomingTasks.length === 0 ? (
            <Text>No upcoming deadlines</Text>
          ) : (
            <Collection
              items={upcomingTasks}
              type="list"
              gap="0.5rem"
              direction="column"
            >
              {(task, index) => (
                <Card
                  key={index}
                  padding="1rem"
                  backgroundColor={
                    getDaysUntilDeadline(task.deadline) <= 1 ? "rgba(239, 68, 68, 0.1)" :
                    getDaysUntilDeadline(task.deadline) <= 3 ? "rgba(249, 115, 22, 0.1)" :
                    "background.secondary"
                  }
                  borderRadius="medium"
                  onClick={() => navigate(`/tasks/view/${task.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <Flex justifyContent="space-between" alignItems="center">
                    <Flex direction="column" gap="0.25rem">
                      <Text fontWeight="bold">{task.title}</Text>
                      <Text fontSize="0.8rem">
                        Assigned to: {task.assignedTo?.name || "Loading..."}
                      </Text>
                    </Flex>
                    <Flex direction="column" alignItems="flex-end" gap="0.25rem">
                      <Badge
                        variation={
                          getDaysUntilDeadline(task.deadline) <= 1 ? "error" :
                          getDaysUntilDeadline(task.deadline) <= 3 ? "warning" :
                          "info"
                        }
                      >
                        {getDaysUntilDeadline(task.deadline) === 0 ? "Today" :
                         getDaysUntilDeadline(task.deadline) === 1 ? "Tomorrow" :
                         `${getDaysUntilDeadline(task.deadline)} days left`}
                      </Badge>
                      <Text fontSize="0.8rem">{formatDate(task.deadline)}</Text>
                    </Flex>
                  </Flex>
                </Card>
              )}
            </Collection>
          )}
        </Flex>
      </Card>
    </Flex>
  );
};

export default AdminDashboard;