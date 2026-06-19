/**
 * Product Card Component
 * Bottom sheet that displays detected product information
 * with options to try virtual look or dismiss
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import type { Detection } from '../types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// BeautyLens brand colour
const PINK = '#C2185B';

interface ProductCardProps {
  product: Detection;
  onDismiss: () => void;
  onTryVirtualLook: (product: Detection) => void;
}

export default function ProductCard({
  product,
  onDismiss,
  onTryVirtualLook,
}: ProductCardProps) {
  const [slideAnim] = useState(() => new Animated.Value(SCREEN_HEIGHT));

  // Products that don't support virtual try-on
  const NO_VIRTUAL_TRYON: string[] = ['brush', 'eyelash curler', 'beauty blender'];
  const productType = product.label?.toLowerCase() ?? '';
  const supportsVirtualTryOn = !NO_VIRTUAL_TRYON.includes(productType);

  React.useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();
  }, [slideAnim]);

  const handleDismiss = () => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 300,
      useNativeDriver: true,
    }).start(() => onDismiss());
  };

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY: slideAnim }] }]}
    >
      <View style={styles.handle} />

      <TouchableOpacity style={styles.closeButton} onPress={handleDismiss}>
        <Text style={styles.closeButtonText}>✕</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={styles.productName}>
          {product.productName ?? product.label}
        </Text>

        {product.priceRange && (
          <Text style={styles.priceRange}>{product.priceRange}</Text>
        )}

        {supportsVirtualTryOn ? (
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={() => {
                handleDismiss();
                setTimeout(() => onTryVirtualLook(product), 350);
              }}
            >
              <Text style={styles.primaryButtonText}>Try Virtual Look</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.infoContainer}>
            <Text style={styles.infoText}>
              Virtual try-on is not available for this product type
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 10,
    maxHeight: SCREEN_HEIGHT * 0.5,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#ccc',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    right: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  closeButtonText: {
    fontSize: 20,
    color: '#666',
    fontWeight: 'bold',
  },
  content: {
    padding: 20,
    paddingTop: 10,
  },
  productName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  priceRange: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  buttonContainer: {
    gap: 12,
  },
  button: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: PINK,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoContainer: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    alignItems: 'center',
  },
  infoText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
