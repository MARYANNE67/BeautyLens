// /**
//  * Product Card Component
//  * Bottom sheet that displays detected product information
//  * with options to try virtual look or dismiss
//  */

// import React, { useState } from 'react';
// import {
//   StyleSheet,
//   View,
//   Text,
//   TouchableOpacity,
//   Animated,
//   Dimensions,
// } from 'react-native';
// import type { Detection } from '../types';

// const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// // BeautyLens brand colour
// const PINK = '#C2185B';

// interface ProductCardProps {
//   product: Detection;
//   onDismiss: () => void;
//   onTryVirtualLook: (product: Detection) => void;
// }

// export default function ProductCard({
//   product,
//   onDismiss,
//   onTryVirtualLook,
// }: ProductCardProps) {
//   const [slideAnim] = useState(() => new Animated.Value(SCREEN_HEIGHT));

//   // Products that don't support virtual try-on
//   const NO_VIRTUAL_TRYON: string[] = ['brush', 'eyelash curler', 'beauty blender'];
//   const productType = product.label?.toLowerCase() ?? '';
//   const supportsVirtualTryOn = !NO_VIRTUAL_TRYON.includes(productType);

//   React.useEffect(() => {
//     Animated.spring(slideAnim, {
//       toValue: 0,
//       useNativeDriver: true,
//       tension: 50,
//       friction: 8,
//     }).start();
//   }, [slideAnim]);

//   const handleDismiss = () => {
//     Animated.timing(slideAnim, {
//       toValue: SCREEN_HEIGHT,
//       duration: 300,
//       useNativeDriver: true,
//     }).start(() => onDismiss());
//   };

//   return (
//     <Animated.View
//       style={[styles.container, { transform: [{ translateY: slideAnim }] }]}
//     >
//       <View style={styles.handle} />

//       <TouchableOpacity style={styles.closeButton} onPress={handleDismiss}>
//         <Text style={styles.closeButtonText}>✕</Text>
//       </TouchableOpacity>

//       <View style={styles.content}>
//         <Text style={styles.productName}>
//           {product.productName ?? product.label}
//         </Text>

//         {product.priceRange && (
//           <Text style={styles.priceRange}>{product.priceRange}</Text>
//         )}

//         {supportsVirtualTryOn ? (
//           <View style={styles.buttonContainer}>
//             <TouchableOpacity
//               style={[styles.button, styles.primaryButton]}
//               onPress={() => {
//                 handleDismiss();
//                 setTimeout(() => onTryVirtualLook(product), 350);
//               }}
//             >
//               <Text style={styles.primaryButtonText}>Try Virtual Look</Text>
//             </TouchableOpacity>
//           </View>
//         ) : (
//           <View style={styles.infoContainer}>
//             <Text style={styles.infoText}>
//               Virtual try-on is not available for this product type
//             </Text>
//           </View>
//         )}
//       </View>
//     </Animated.View>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     position: 'absolute',
//     bottom: 0,
//     left: 0,
//     right: 0,
//     backgroundColor: '#fff',
//     borderTopLeftRadius: 20,
//     borderTopRightRadius: 20,
//     shadowColor: '#000',
//     shadowOffset: { width: 0, height: -2 },
//     shadowOpacity: 0.25,
//     shadowRadius: 3.84,
//     elevation: 10,
//     maxHeight: SCREEN_HEIGHT * 0.5,
//   },
//   handle: {
//     width: 40,
//     height: 4,
//     backgroundColor: '#ccc',
//     borderRadius: 2,
//     alignSelf: 'center',
//     marginTop: 8,
//     marginBottom: 8,
//   },
//   closeButton: {
//     position: 'absolute',
//     top: 10,
//     right: 15,
//     width: 30,
//     height: 30,
//     justifyContent: 'center',
//     alignItems: 'center',
//     zIndex: 1,
//   },
//   closeButtonText: {
//     fontSize: 20,
//     color: '#666',
//     fontWeight: 'bold',
//   },
//   content: {
//     padding: 20,
//     paddingTop: 10,
//   },
//   productName: {
//     fontSize: 20,
//     fontWeight: 'bold',
//     color: '#333',
//     marginBottom: 8,
//     textAlign: 'center',
//   },
//   priceRange: {
//     fontSize: 16,
//     color: '#666',
//     marginBottom: 20,
//     textAlign: 'center',
//   },
//   buttonContainer: {
//     gap: 12,
//   },
//   button: {
//     paddingVertical: 16,
//     paddingHorizontal: 24,
//     borderRadius: 12,
//     alignItems: 'center',
//   },
//   primaryButton: {
//     backgroundColor: PINK,
//   },
//   primaryButtonText: {
//     color: '#fff',
//     fontSize: 16,
//     fontWeight: 'bold',
//   },
//   infoContainer: {
//     paddingVertical: 16,
//     paddingHorizontal: 24,
//     backgroundColor: '#f5f5f5',
//     borderRadius: 12,
//     alignItems: 'center',
//   },
//   infoText: {
//     color: '#666',
//     fontSize: 14,
//     textAlign: 'center',
//     fontStyle: 'italic',
//   },
// });




/**
 * Product Card Component
 * Bottom sheet that displays detected product information
 * with options to try virtual look or dismiss.
 * Now shows enriched brand/shade info from OCR recognition.
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  Alert
} from 'react-native';
import type { Detection } from '../types';
import { saveProductToCollection } from '../app/(tabs)/collection';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const PINK      = '#C2185B';
const PINK_LIGHT = '#FCE4EC';
const GRAY      = '#666';
const DARK      = '#333';

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

  const NO_VIRTUAL_TRYON: string[] = ['brush', 'eyelash curler', 'beauty blender'];
  const productType = product.label?.toLowerCase() ?? '';
  const supportsVirtualTryOn = !NO_VIRTUAL_TRYON.includes(productType);

  // Build the best display name from OCR-enriched data
  const buildDisplayName = (): string => {
    if (product.brand && product.productName) {
      return `${product.brand} ${product.productName}`;
    }
    if (product.brand) {
      return `${product.brand} ${product.displayName || product.label}`;
    }
    return product.productName ?? product.displayName ?? product.label ?? 'Product';
  };

  // Category label e.g. "Foundation · MAC"
  const buildSubtitle = (): string => {
    const parts: string[] = [];
    const category = (product.displayName || product.label || '').replace(
      /\b\w/g, (c) => c.toUpperCase()
    );
    if (category) parts.push(category);
    if (product.brand && !buildDisplayName().includes(product.brand)) {
      parts.push(product.brand);
    }
    return parts.join(' · ');
  };

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

        {/* Brand badge — only shown when OCR detected a brand */}
        {product.brand && (
          <View style={styles.brandBadge}>
            <Text style={styles.brandBadgeText}>{product.brand}</Text>
          </View>
        )}

        {/* Product name */}
        <Text style={styles.productName} numberOfLines={2}>
          {buildDisplayName()}
        </Text>

        {/* Category subtitle */}
        <Text style={styles.subtitle}>{buildSubtitle()}</Text>

        {/* Shade chip — only shown when OCR detected a shade */}
        {product.shade && (
          <View style={styles.shadeRow}>
            <View style={styles.shadeDot} />
            <Text style={styles.shadeText}>Shade: {product.shade}</Text>
          </View>
        )}

        {/* Confidence */}
        <Text style={styles.confidence}>
          {Math.round((product.confidence ?? 0) * 100)}% confidence
        </Text>

        {/* Price range if available */}
        {product.priceRange && (
          <Text style={styles.priceRange}>{product.priceRange}</Text>
        )}

        {/* CTA */}
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
            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#f5f5f5' }]}
              onPress={async () => {
                await saveProductToCollection({
                  id: product.id,
                  brand: product.brand,
                  productName: product.productName,
                  displayName: product.displayName,
                  label: product.label,
                  shade: product.shade,
                  confidence: product.confidence,
                });
                Alert.alert('Saved!', 'Product added to your collection.');
              }}
            >
              <Text style={{ color: DARK, fontSize: 15, fontWeight: '600' }}>
                Save to Collection
              </Text>
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
    maxHeight: SCREEN_HEIGHT * 0.55,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#ccc',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
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
    color: GRAY,
    fontWeight: 'bold',
  },
  content: {
    padding: 20,
    paddingTop: 8,
    alignItems: 'center',
  },
  brandBadge: {
    backgroundColor: PINK_LIGHT,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  brandBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: PINK,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  productName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: DARK,
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: GRAY,
    marginBottom: 8,
    textAlign: 'center',
  },
  shadeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    backgroundColor: '#f8f8f8',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },
  shadeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: PINK,
  },
  shadeText: {
    fontSize: 13,
    color: DARK,
    fontWeight: '500',
  },
  confidence: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 8,
  },
  priceRange: {
    fontSize: 16,
    color: GRAY,
    marginBottom: 12,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
    marginTop: 4,
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
    width: '100%',
  },
  infoText: {
    color: GRAY,
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
