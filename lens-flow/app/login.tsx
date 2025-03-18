import { useRouter } from 'expo-router';
import React from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';

const LoginScreen = () => {
    const navigation = useRouter();
    const replacePath = (path: any) => {
        navigation.replace(path);
    }

    return (
        <View className="flex-1 justify-center items-center bg-gray-100 p-4">

        <Text className="text-3xl font-bold text-gray-800 mb-8">Login</Text>

        <TextInput
            className="w-full h-12 border border-gray-300 rounded-lg px-4 mb-4 bg-white"
            placeholder="Email"
            placeholderTextColor="#9CA3AF"
        />

        <TextInput
            className="w-full h-12 border border-gray-300 rounded-lg px-4 mb-6 bg-white"
            placeholder="Senha"
            placeholderTextColor="#9CA3AF"
            secureTextEntry
        />

        <Pressable
            className="w-full h-14 bg-blue-500 rounded-lg justify-center items-center mb-4"
            onPress={() => {
                replacePath('/(tabs)/home');
            }}
        >
            <Text className="text-white font-bold text-lg">Entrar</Text>
        </Pressable>

        <Pressable
            className="w-full h-14 bg-gray-500 rounded-lg justify-center items-center"
            onPress={() => replacePath("/welcome")}
        >
            <Text className="text-white font-bold text-lg">Voltar</Text>
        </Pressable>
        </View>
    );
};

export default LoginScreen;