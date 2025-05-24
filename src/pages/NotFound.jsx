import { Flex, Heading, Text, Button } from "@aws-amplify/ui-react";
import { useNavigate } from "react-router-dom";

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <Flex
      direction="column"
      justifyContent="center"
      alignItems="center"
      height="100vh"
      gap="1.5rem"
      padding="2rem"
      textAlign="center"
    >
      <Heading level={1} fontSize="8rem" margin="0" color="primary.90">
        404
      </Heading>
      <Heading level={2} margin="0">
        Page Not Found
      </Heading>
      <Text color="font.secondary" maxWidth="30rem">
        The page you are looking for might have been removed, had its name
        changed, or is temporarily unavailable.
      </Text>
      <Button
        variation="primary"
        size="large"
        onClick={() => navigate("/")}
      >
        Go to Home
      </Button>
    </Flex>
  );
};

export default NotFound;