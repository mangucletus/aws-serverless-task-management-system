import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Flex, 
  Text, 
  Button, 
  Divider,
  ScrollView
} from '@aws-amplify/ui-react';
import { 
  Home, 
  CheckSquare, 
  PlusSquare, 
  Users, 
  Clock, 
  BarChart,
  Calendar,
  Settings
} from 'lucide-react';

const Sidebar = ({ isOpen, userRole, closeSidebar }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const adminMenuItems = [
    { icon: <Home size={20} />, label: 'Dashboard', path: '/admin/dashboard' },
    { icon: <PlusSquare size={20} />, label: 'Create Task', path: '/admin/create-task' },
    { icon: <CheckSquare size={20} />, label: 'Tasks', path: '/admin/tasks' },
    { icon: <Users size={20} />, label: 'Team Members', path: '/admin/team-members' },
    { icon: <BarChart size={20} />, label: 'Reports', path: '/admin/reports' },
  ];

  const teamMemberMenuItems = [
    { icon: <Home size={20} />, label: 'Dashboard', path: '/team/dashboard' },
    { icon: <CheckSquare size={20} />, label: 'My Tasks', path: '/team/tasks' },
    { icon: <Clock size={20} />, label: 'Recent Activity', path: '/team/activity' },
    { icon: <Calendar size={20} />, label: 'Calendar', path: '/team/calendar' },
  ];

  const menuItems = userRole === 'ADMIN' ? adminMenuItems : teamMemberMenuItems;

  const handleNavigation = (path) => {
    navigate(path);
    if (typeof closeSidebar === 'function') {
      closeSidebar();
    }
  };

  return (
    <Flex
      as="aside"
      direction="column"
      padding="1rem"
      backgroundColor="background.primary"
      width={isOpen ? '240px' : '0'}
      overflow="hidden"
      height="100%"
      style={{
        transition: 'width 0.3s ease',
        boxShadow: '1px 0 3px rgba(0,0,0,0.1)',
        position: 'relative',
        zIndex: 10
      }}
    >
      <ScrollView height="100%">
        <Flex direction="column" gap="0.5rem" marginTop="1rem">
          {menuItems.map((item) => (
            <Button
              key={item.path}
              onClick={() => handleNavigation(item.path)}
              variation={location.pathname === item.path ? 'primary' : 'link'}
              size="large"
              justifyContent="flex-start"
              style={{
                backgroundColor: location.pathname === item.path ? 'var(--amplify-colors-primary-10)' : 'transparent',
                color: location.pathname === item.path ? 'var(--amplify-colors-primary-90)' : 'var(--amplify-colors-font-primary)',
                borderRadius: '0.375rem',
                transition: 'all 0.2s ease',
              }}
            >
              <Flex alignItems="center" gap="0.75rem">
                {item.icon}
                <Text>{item.label}</Text>
              </Flex>
            </Button>
          ))}
        </Flex>

        <Divider marginTop="1rem" marginBottom="1rem" />

        <Button
          onClick={() => handleNavigation('/profile/edit')}
          variation="link"
          size="large"
          justifyContent="flex-start"
          style={{
            borderRadius: '0.375rem',
          }}
        >
          <Flex alignItems="center" gap="0.75rem">
            <Settings size={20} />
            <Text>Settings</Text>
          </Flex>
        </Button>
      </ScrollView>
    </Flex>
  );
};

export default Sidebar;