import { useState, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { 
  Flex, 
  Heading, 
  Card, 
  Text, 
  Badge, 
  Collection,
  Loader,
  View,
  Button,
  Tabs,
  TabItem,
  Divider
} from "@aws-amplify/ui-react";
import { 
  Clock, 
  CheckCircle, 
  Calendar,
  Filter,
  AlertCircle
} from "lucide-react";
import { generateClient } from "aws-amplify/data";
import { formatDate, getDaysUntilDeadline } from "../../utils/dateUtils";
import TaskCard from "../../components/tasks/TaskCard";

const client = generateClient();

const TeamDashboard = () => {
  const navigate = useNavigate();
  const { userProfile } = useOutletContext() || {};
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [taskStats, setTaskStats] = useState({
    pending: 0,
    inProgress: 0,
    completed: 0,
    total: 0
  });
  const [upcomingDeadlines, setUpcomingDeadlines] = useState([]);
  const [currentTab, setCurrentTab] = useState("all");

  useEffect(() => {
    const fetchTasks = async () => {
      if (!userProfile) return;
      
      try {
        setLoading(true);
        
        // Fetch all tasks assigned to the user
        const { data: userTasks } = await client.models.Task.list({
          filter: {
            assignedTo: {
              id: {
                eq: userProfile.id
              }
            }
          }
        });
        
        setTasks(userTasks);
        
        // Calculate task statistics
        const stats = {
          pending: userTasks.filter(task => task.status === "PENDING").length,
          inProgress: userTasks.filter(task => task.status === "IN_PROGRESS").length,
          completed: userTasks.filter(task => task.status === "COMPLETED").length,
          total: userTasks.length
        };
        setTaskStats(stats);
        
        // Get upcoming deadlines (tasks not completed with closest deadlines)
        const upcomingTasks = userTasks
          .filter(task => task.status !== "COMPLETED")
          .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
          .slice(0, 3);
        
        setUpcomingDeadlines(upcomingTasks);
        
      } catch (error) {
        console.error("Error fetching tasks:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTasks();
  }, [userProfile]);

  const getFilteredTasks = () => {
    switch (currentTab) {
      case "pending":
        return tasks.filter(task => task.status === "PENDING");
      case "in-progress":
        return tasks.filter(task => task.status === "IN_PROGRESS");
      case "completed":
        return tasks.filter(task => task.status === "COMPLETED");
      default:
        return tasks;
    }
  };

  if (loading) {
    return <Loader variation="linear" />;
  }

  return (
    <Flex direction="column" gap="2rem">
      <Heading level={3}>My Dashboard</Heading>

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
      </Flex>

      {/* Upcoming Deadlines */}
      {upcomingDeadlines.length > 0 && (
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
            </Flex>
            
            <Collection
              items={upcomingDeadlines}
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
                        {task.description.substring(0, 60)}
                        {task.description.length > 60 ? "..." : ""}
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
          </Flex>
        </Card>
      )}

      {/* My Tasks */}
      <Card
        variation="elevated"
        padding="1.5rem"
        backgroundColor="background.primary"
      >
        <Flex direction="column" gap="1.5rem">
          <Flex justifyContent="space-between" alignItems="center">
            <Heading level={5}>My Tasks</Heading>
            <Button
              size="small"
              onClick={() => {}}
              variation="link"
            >
              <Flex alignItems="center" gap="0.25rem">
                <Filter size={16} />
                <Text>Filter</Text>
              </Flex>
            </Button>
          </Flex>

          <Tabs
            currentIndex={
              currentTab === "all" ? 0 :
              currentTab === "pending" ? 1 :
              currentTab === "in-progress" ? 2 :
              currentTab === "completed" ? 3 : 0
            }
            onChange={(i) => {
              const tabs = ["all", "pending", "in-progress", "completed"];
              setCurrentTab(tabs[i]);
            }}
          >
            <TabItem title="All" />
            <TabItem title="Pending" />
            <TabItem title="In Progress" />
            <TabItem title="Completed" />
          </Tabs>
          
          <Divider />
          
          {getFilteredTasks().length === 0 ? (
            <Flex 
              direction="column" 
              alignItems="center" 
              padding="2rem"
              gap="1rem"
            >
              <Text>No tasks found</Text>
              <Text fontSize="0.875rem" color="font.secondary">
                {currentTab === "all" 
                  ? "You don't have any tasks assigned yet."
                  : `You don't have any ${currentTab.replace('-', ' ')} tasks.`}
              </Text>
            </Flex>
          ) : (
            <Collection
              items={getFilteredTasks()}
              type="list"
              gap="1rem"
              direction="column"
            >
              {(task) => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  onClick={() => navigate(`/tasks/view/${task.id}`)}
                />
              )}
            </Collection>
          )}
        </Flex>
      </Card>
    </Flex>
  );
};

export default TeamDashboard;