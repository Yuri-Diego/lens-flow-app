import { useRouter } from 'expo-router';
import React from 'react';
import { View, Text, Pressable } from 'react-native';

const WelcomeScreen = () => {
    const navigation = useRouter();
    const replacePath = (path: any) => {
        navigation.replace(path);
    }
    return (
        <View className="flex-1 justify-center items-center bg-gray-100 p-4">

        <Text className="text-4xl font-bold text-gray-800 mb-8">Lens-Flow</Text>

        <Pressable
            className="w-full h-14 bg-blue-500 rounded-lg justify-center items-center mb-4"
            onPress={() => replacePath('/login')}
        >
            <Text className="text-white font-bold text-lg">Entrar</Text>
        </Pressable>

        <Pressable
            className="w-full h-14 bg-green-500 rounded-lg justify-center items-center"
            onPress={() => replacePath('/register')}
        >
            <Text className="text-white font-bold text-lg">Registrar</Text>
        </Pressable>
        </View>
    );
};

export default WelcomeScreen;