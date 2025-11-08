import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from './screens/HomeScreen';
import GroupDetailsScreen from './screens/GroupDetailsScreen';
import AddExpenseScreen from './screens/AddExpenseScreen';
import AddMemberScreen from './screens/AddMemberScreen';
import SuggestedSettlementsScreen from './screens/SuggestedSettlementsScreen';
import JoinViaInviteScreen from './screens/JoinViaInviteScreen';
import AppearanceScreen from './screens/AppearanceScreen';
import AccountScreen from './screens/AccountScreen';
import LoginScreen from './screens/auth/LoginScreen';
import SignupScreen from './screens/auth/SignupScreen';
import VerifyEmailScreen from './screens/auth/VerifyEmailScreen';
import ForgotPasswordScreen from './screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen from './screens/auth/ResetPasswordScreen';
import ChangePasswordScreen from './screens/ChangePasswordScreen';
import { ThemeProvider, useTheme, navThemeFrom } from './ui/theme';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { ToastHost } from './ui/toast';

const Stack = createNativeStackNavigator();

function AppShell() {
  const { theme } = useTheme();
  const { token, ready } = useAuth();
  const navTheme = navThemeFrom(theme);
  const isAuthed = !!token;
  if (!ready) {
    return null;
  }
  const Tab = createBottomTabNavigator();
  const GroupsStack = createNativeStackNavigator();
  const AccountStack = createNativeStackNavigator();

  function GroupsStackScreen() {
    return (
      <GroupsStack.Navigator screenOptions={{
        headerStyle: { backgroundColor: theme.colors.card },
        headerShadowVisible: false,
        headerTintColor: theme.colors.text,
        contentStyle: { backgroundColor: theme.colors.bg }
      }}>
        <GroupsStack.Screen name="Home" component={HomeScreen} options={{ title: 'SplitHive' }} />
        <GroupsStack.Screen name="GroupDetails" component={GroupDetailsScreen} options={{ title: 'Group' }} />
        <GroupsStack.Screen name="AddExpense" component={AddExpenseScreen} options={{ title: 'Add Expense' }} />
        <GroupsStack.Screen name="AddMember" component={AddMemberScreen} options={{ title: 'Add Member' }} />
        <GroupsStack.Screen name="SuggestedSettlements" component={SuggestedSettlementsScreen} options={{ title: 'Suggested Settlements' }} />
        <GroupsStack.Screen name="JoinViaInvite" component={JoinViaInviteScreen} options={{ title: 'Join via Invite' }} />
      </GroupsStack.Navigator>
    );
  }

  function AccountStackScreen() {
    return (
      <AccountStack.Navigator screenOptions={{
        headerStyle: { backgroundColor: theme.colors.card },
        headerShadowVisible: false,
        headerTintColor: theme.colors.text,
        contentStyle: { backgroundColor: theme.colors.bg }
      }}>
        <AccountStack.Screen name="AccountHome" component={AccountScreen} options={{ title: 'Account' }} />
        <AccountStack.Screen name="Appearance" component={AppearanceScreen} options={{ title: 'Appearance' }} />
        <AccountStack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ title: 'Change Password' }} />
      </AccountStack.Navigator>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {isAuthed ? (
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarStyle: { backgroundColor: theme.colors.card, borderTopColor: theme.colors.border },
            tabBarActiveTintColor: theme.colors.primary,
            tabBarInactiveTintColor: theme.colors.subtext,
            tabBarIcon: ({ color, size }) => {
              const name = route.name === 'Groups' ? 'people-outline' : 'person-circle-outline';
              return <Ionicons name={name} size={size} color={color} />;
            }
          })}
        >
          <Tab.Screen name="Groups" component={GroupsStackScreen} />
          <Tab.Screen name="Account" component={AccountStackScreen} />
        </Tab.Navigator>
      ) : (
        <Stack.Navigator screenOptions={{
          headerStyle: { backgroundColor: theme.colors.card },
          headerShadowVisible: false,
          headerTintColor: theme.colors.text,
          contentStyle: { backgroundColor: theme.colors.bg }
        }}>
          <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign In' }} />
          <Stack.Screen name="Signup" component={SignupScreen} options={{ title: 'Create Account' }} />
          <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} options={{ title: 'Verify Email' }} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Forgot Password' }} />
          <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} options={{ title: 'Reset Password' }} />
        </Stack.Navigator>
      )}
      <ToastHost />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  );
}
