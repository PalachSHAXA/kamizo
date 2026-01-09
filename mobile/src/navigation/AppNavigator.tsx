import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

import { useAuthStore } from '../stores/authStore';
import { LoginScreen } from '../screens/LoginScreen';
import { ColleaguesScreen } from '../screens/ColleaguesScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Иконки для табов (простые эмодзи)
const TabBarIcon = ({ focused, icon }: { focused: boolean; icon: string }) => (
  <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.5 }}>{icon}</Text>
);

// Главный таб навигатор
const MainTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#F59E0B',
        tabBarInactiveTintColor: '#9CA3AF',
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Главная',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon focused={focused} icon="🏠" />
          ),
        }}
      />
      <Tab.Screen
        name="Colleagues"
        component={ColleaguesScreen}
        options={{
          title: 'Коллеги',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon focused={focused} icon="👥" />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Профиль',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon focused={focused} icon="👤" />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

// Временный экран главной
const HomeScreen = () => (
  <Text style={{ flex: 1, textAlign: 'center', marginTop: 50, fontSize: 18 }}>
    Главная страница (в разработке)
  </Text>
);

// Временный экран профиля
const ProfileScreen = () => {
  const { user, logout } = useAuthStore();

  return (
    <Text
      style={{ flex: 1, textAlign: 'center', marginTop: 50, fontSize: 18 }}
      onPress={logout}
    >
      Профиль: {user?.name} (нажмите для выхода)
    </Text>
  );
};

export const AppNavigator = () => {
  const { user } = useAuthStore();

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
