
import { GeminiAnalysis } from "../types";
import { apiService } from "./apiService";

export const getRouteAnalysis = async (routeName: string): Promise<GeminiAnalysis> => {
  return apiService.analyzeRoute(routeName);
};
