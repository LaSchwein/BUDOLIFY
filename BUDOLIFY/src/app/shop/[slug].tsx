import { useLocalSearchParams } from 'expo-router';

import { PublicShopScreen } from '@/components/shop/public-shop-screen';

export default function PublicShopRoute() {
  const { slug } = useLocalSearchParams<{ slug?: string | string[] }>();
  return <PublicShopScreen slug={Array.isArray(slug) ? slug[0] : slug} />;
}
