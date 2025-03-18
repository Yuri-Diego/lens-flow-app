import { useRouter } from 'expo-router';
import React from 'react';
import { View, Text, Pressable } from 'react-native';

const HomeScreen = () => {
    const navigation = useRouter();
    const replacePath = (path: any) => {
        navigation.replace(path);
    }


    return (
        <View className="flex-1 justify-center items-center bg-gray-100 p-4">
        <Text className="text-3xl font-bold text-gray-800 mb-8">Bem-vindo ao Lens-Flow!</Text>

        <Pressable
            className="w-full h-14 bg-red-500 rounded-lg justify-center items-center"
            onPress={() => {
            replacePath('/');
            }}
        >
            <Text className="text-white font-bold text-lg">Sair</Text>
        </Pressable>
        </View>
    );
};

export default HomeScreen;