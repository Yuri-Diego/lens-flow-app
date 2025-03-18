import { useRouter } from 'expo-router';
import React from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';

const RegisterScreen = () => {
    const navigation = useRouter()
    const replacePath = (path: any) => {
        navigation.replace(path);
    }
    return (
        <View className="flex-1 justify-center items-center bg-gray-100 p-4">

        <Text className="text-3xl font-bold text-gray-800 mb-8">Registrar</Text>

        <TextInput
            className="w-full h-12 border border-gray-300 rounded-lg px-4 mb-4 bg-white"
            placeholder="Nome"
            placeholderTextColor="#9CA3AF"
        />

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
            className="w-full h-14 bg-green-500 rounded-lg justify-center items-center mb-4"
            onPress={() => alert('Registro realizado com sucesso!')}
        >
            <Text className="text-white font-bold text-lg">Registrar</Text>
        </Pressable>

        <Pressable
            className="w-full h-14 bg-gray-500 rounded-lg justify-center items-center"
            onPress={() => replacePath('/welcome')}
        >
            <Text className="text-white font-bold text-lg">Voltar</Text>
        </Pressable>
        </View>
    );
};

export default RegisterScreen;