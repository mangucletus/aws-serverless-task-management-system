import {
  Card,
  Flex,
  Text,
  Badge,
  View,
  Heading,
} from "@aws-amplify/ui-react";
import { 
  Calendar,
  MapPin,
  Clock
} from "lucide-react";
import { formatDate, getDaysUntilDeadline } from "../../utils/dateUtils";

const TaskCard = ({ task, onClick }) => {
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
    <Card
      variation="elevated"
      padding="1rem"
      backgroundColor="background.primary"
      borderRadius="medium"
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      <Flex direction="column" gap="0.75rem">
        <Flex justifyContent="space-between" alignItems="flex-start">
          <Heading level={6} margin="0">
            {task.title}
          </Heading>
          <Flex gap="0.5rem">
            <Badge
              variation={statusVariation[task.status]}
            >
              {task.status.replace("_", " ")}
            </Badge>
            <View
              width="0.5rem"
              height="0.5rem"
              backgroundColor={priorityColors[task.priority]}
              borderRadius="50%"
              marginTop="0.5rem"
              title={`Priority: ${task.priority}`}
            />
          </Flex>
        </Flex>

        <Text fontSize="0.875rem" color="font.secondary">
          {task.description.length > 100
            ? `${task.description.substring(0, 100)}...`
            : task.description}
        </Text>

        <Flex gap="1rem" flexWrap="wrap">
          <Flex alignItems="center" gap="0.25rem">
            <Calendar size={14} />
            <Text fontSize="0.75rem" color="font.secondary">
              {formatDate(task.deadline)}
            </Text>
          </Flex>

          {task.location && (
            <Flex alignItems="center" gap="0.25rem">
              <MapPin size={14} />
              <Text fontSize="0.75rem" color="font.secondary">
                {task.location}
              </Text>
            </Flex>
          )}

          {task.status !== "COMPLETED" && (
            <Flex alignItems="center" gap="0.25rem">
              <Clock size={14} />
              <Text
                fontSize="0.75rem"
                color={
                  getDaysUntilDeadline(task.deadline) <= 1
                    ? "var(--amplify-colors-error-80)"
                    : getDaysUntilDeadline(task.deadline) <= 3
                    ? "var(--amplify-colors-warning-80)"
                    : "font.secondary"
                }
              >
                {getDaysUntilDeadline(task.deadline) === 0
                  ? "Due today"
                  : getDaysUntilDeadline(task.deadline) === 1
                  ? "Due tomorrow"
                  : `${getDaysUntilDeadline(task.deadline)} days left`}
              </Text>
            </Flex>
          )}
        </Flex>
      </Flex>
    </Card>
  );
};

export default TaskCard;