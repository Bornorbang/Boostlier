import { Home } from "@/components/home";
import { homepageTitle, homepageDescription, publicMetadata } from "@/lib/public-seo";
export const metadata = publicMetadata("/", homepageTitle, homepageDescription);
export default Home;
