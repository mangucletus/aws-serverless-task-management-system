import { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { Flex, View } from '@aws-amplify/ui-react';
import Sidebar from './Sidebar';
import Header from './Header';
import { generateClient } from 'aws-amplify/data';
import { getUserRole } from '../../utils/userUtils';

const client = generateClient();

const Layout = () => {
  const { user } = useAuthenticator((context) => [context.user]);
  const [userProfile, setUserProfile] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const profile = await getUserRole(user);
        setUserProfile(profile);
      } catch (error) {
        console.error('Error fetching user profile:', error);
      }
    };

    if (user) {
      fetchUserProfile();
    }

    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [user]);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <Flex direction="column" height="100vh">
      <Header 
        user={user} 
        userProfile={userProfile} 
        toggleSidebar={toggleSidebar} 
        isMobile={isMobile}
      />
      <Flex flex={1} overflow="hidden">
        <Sidebar 
          isOpen={sidebarOpen} 
          userRole={userProfile?.role || 'TEAM_MEMBER'} 
          closeSidebar={() => isMobile && setSidebarOpen(false)}
        />
        <View
          flex={1}
          padding="1.5rem"
          backgroundColor="background.secondary"
          overflow="auto"
          style={{
            transition: 'margin-left 0.3s ease',
            marginLeft: isMobile ? 0 : (sidebarOpen ? '0' : '-240px'),
          }}
        >
          <Outlet context={{ userProfile }} />
        </View>
      </Flex>
    </Flex>
  );
};

export default Layout;