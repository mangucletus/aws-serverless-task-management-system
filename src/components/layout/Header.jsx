import { useNavigate } from 'react-router-dom';
import { 
  Flex, 
  Text, 
  Button, 
  Menu, 
  MenuItem, 
  Divider, 
  Badge,
  Image 
} from '@aws-amplify/ui-react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { 
  Menu as MenuIcon, 
  User, 
  LogOut, 
  Settings, 
  Bell
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/data';

const client = generateClient();

const Header = ({ user, userProfile, toggleSidebar, isMobile }) => {
  const { signOut } = useAuthenticator();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchNotifications = async () => {
      if (!userProfile) return;

      try {
        const result = await client.models.Notification.list({
          filter: {
            user: {
              id: {
                eq: userProfile.id
              }
            },
            isRead: {
              eq: false
            }
          },
          limit: 5
        });
        
        setNotifications(result.data);
        setUnreadCount(result.data.length);
      } catch (error) {
        console.error('Error fetching notifications:', error);
      }
    };

    if (userProfile) {
      fetchNotifications();
    }
  }, [userProfile]);

  const markAsRead = async (notificationId) => {
    try {
      await client.models.Notification.update({
        id: notificationId,
        isRead: true
      });
      
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      setUnreadCount(prev => prev - 1);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  return (
    <Flex
      as="header"
      backgroundColor="background.primary"
      padding="1rem"
      justifyContent="space-between"
      alignItems="center"
      boxShadow="0 1px 3px rgba(0,0,0,0.1)"
    >
      <Flex alignItems="center" gap="1rem">
        <Button
          onClick={toggleSidebar}
          variation="link"
          size="small"
          aria-label="Toggle sidebar"
        >
          <MenuIcon size={24} />
        </Button>
        <Text
          fontSize="1.5rem"
          fontWeight="bold"
          color="primary.90"
        >
          TaskFlow
        </Text>
        {userProfile && (
          <Badge variation={userProfile.role === 'ADMIN' ? 'info' : 'success'}>
            {userProfile.role === 'ADMIN' ? 'Admin' : 'Team Member'}
          </Badge>
        )}
      </Flex>

      <Flex alignItems="center" gap="1rem">
        {/* Notifications */}
        <Menu
          trigger={
            <Button variation="link" size="small" aria-label="Notifications">
              <Flex position="relative">
                <Bell size={20} />
                {unreadCount > 0 && (
                  <Badge
                    variation="error"
                    size="small"
                    style={{
                      position: 'absolute',
                      top: '-8px',
                      right: '-8px',
                      borderRadius: '50%',
                      padding: '0.1rem 0.4rem',
                      fontSize: '0.7rem'
                    }}
                  >
                    {unreadCount}
                  </Badge>
                )}
              </Flex>
            </Button>
          }
        >
          <Text padding="0.5rem 1rem" fontWeight="bold">
            Notifications
          </Text>
          <Divider />
          {notifications.length === 0 ? (
            <MenuItem onClick={() => {}}>
              <Text>No new notifications</Text>
            </MenuItem>
          ) : (
            <>
              {notifications.map(notification => (
                <MenuItem key={notification.id} onClick={() => markAsRead(notification.id)}>
                  <Flex direction="column" gap="0.25rem">
                    <Text fontWeight="bold">{notification.type}</Text>
                    <Text fontSize="0.8rem">{notification.message}</Text>
                  </Flex>
                </MenuItem>
              ))}
              <Divider />
              <MenuItem onClick={() => navigate('/notifications')}>
                <Text>View all notifications</Text>
              </MenuItem>
            </>
          )}
        </Menu>

        {/* User menu */}
        <Menu
          trigger={
            <Button variation="link" size="small" aria-label="User menu">
              {userProfile?.avatar ? (
                <Image
                  src={userProfile.avatar}
                  alt={userProfile.name}
                  width="32px"
                  height="32px"
                  borderRadius="50%"
                />
              ) : (
                <User size={20} />
              )}
            </Button>
          }
        >
          <Text padding="0.5rem 1rem" fontWeight="bold">
            {userProfile?.name || user?.username || 'User'}
          </Text>
          <Divider />
          <MenuItem onClick={() => navigate('/profile/view')}>
            <Flex alignItems="center" gap="0.5rem">
              <User size={16} />
              <Text>Profile</Text>
            </Flex>
          </MenuItem>
          <MenuItem onClick={() => navigate('/profile/edit')}>
            <Flex alignItems="center" gap="0.5rem">
              <Settings size={16} />
              <Text>Settings</Text>
            </Flex>
          </MenuItem>
          <Divider />
          <MenuItem onClick={signOut}>
            <Flex alignItems="center" gap="0.5rem">
              <LogOut size={16} />
              <Text>Sign out</Text>
            </Flex>
          </MenuItem>
        </Menu>
      </Flex>
    </Flex>
  );
};

export default Header;