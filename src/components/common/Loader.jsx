import { Flex, Loader as AmplifyLoader } from '@aws-amplify/ui-react';

export const Loader = () => {
  return (
    <Flex
      direction="column"
      justifyContent="center"
      alignItems="center"
      height="100vh"
      width="100%"
    >
      <AmplifyLoader size="large" variation="linear" />
    </Flex>
  );
};