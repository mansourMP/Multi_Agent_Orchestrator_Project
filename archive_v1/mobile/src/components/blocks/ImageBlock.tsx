import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

import { useAppTheme } from '@/src/theme/useAppTheme';
interface ImageBlockProps {
  uri: string;
}

export const ImageBlock: React.FC<ImageBlockProps> = ({ uri }) => {
  const theme = useAppTheme();
  const styles = useStyles(theme);
  return (
    <View style={styles.container}>
      <Image source={{ uri }} style={styles.image} resizeMode="cover" />
    </View>
  );
};

const useStyles = (theme: any) => StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 1.5,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginVertical: 8,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
