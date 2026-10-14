import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { HeatmapPanel } from "./heatmap-panel";
import type { AssistanceRequest } from "./assistance-manager";
import { api } from "../services/api";

interface Complaint {
  id: string;
  ticketId?: string;
  title?: string;
  category: string;
  status: string;
  priority: string;
  coordinates?: { lat: number; lng: number };
  latitude?: number;
  longitude?: number;
}

interface HeatmapDashboardProps {
  complaints: Complaint[];
  assistanceRequests: AssistanceRequest[];
}

const ACTIONABLE_STATUSES = new Set(["pending", "in-progress"]);
const PAGE_SIZE = 1000;

async function fetchRemainingRequests<T>(
  endpoint: "complaints" | "assistance",
  initialCount: number,
): Promise<T[]> {
  if (initialCount < PAGE_SIZE) return [];

  const records: T[] = [];
  for (let page = 2; ; page += 1) {
    const query = new URLSearchParams({
      archived: "false",
      limit: String(PAGE_SIZE),
      page: String(page),
    });
    if (endpoint === "complaints") query.set("includeMedia", "false");

    const response = await api.get<{
      complaints?: T[];
      assistanceRequests?: T[];
    }>(`/${endpoint}?${query.toString()}`);
    const pageRecords =
      endpoint === "complaints"
        ? response.complaints
        : response.assistanceRequests;

    if (!pageRecords) {
      throw new Error(`The API response did not include ${endpoint}.`);
    }

    records.push(...pageRecords);
    if (pageRecords.length < PAGE_SIZE) return records;
  }
}

function mergeById<T extends { id: string }>(first: T[], second: T[]): T[] {
  return Array.from(
    new Map([...first, ...second].map((record) => [record.id, record])).values(),
  );
}

function normalizeActionableStatus(status: string): string {
  return status.trim().toLowerCase().replace(/\s+/g, "-");
}

export function HeatmapDashboard({
  complaints,
  assistanceRequests,
}: HeatmapDashboardProps) {
  const [additionalRecords, setAdditionalRecords] = useState<{
    complaints: Complaint[];
    assistanceRequests: AssistanceRequest[];
  }>({ complaints: [], assistanceRequests: [] });
  const [paginationError, setPaginationError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadRemainingRequests = async () => {
      try {
        const [moreComplaints, moreAssistanceRequests] = await Promise.all([
          fetchRemainingRequests<Complaint>("complaints", complaints.length),
          fetchRemainingRequests<AssistanceRequest>(
            "assistance",
            assistanceRequests.length,
          ),
        ]);
        if (cancelled) return;

        setAdditionalRecords({
          complaints: moreComplaints,
          assistanceRequests: moreAssistanceRequests,
        });
        setPaginationError(null);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load all heatmap requests.", error);
        setPaginationError(
          error instanceof Error
            ? error.message
            : "Unable to load all pending and in-progress requests.",
        );
      }
    };

    void loadRemainingRequests();
    return () => {
      cancelled = true;
    };
  }, [complaints, assistanceRequests]);

  const allComplaints = useMemo(
    () => mergeById(complaints, additionalRecords.complaints),
    [complaints, additionalRecords.complaints],
  );
  const allAssistanceRequests = useMemo(
    () => mergeById(assistanceRequests, additionalRecords.assistanceRequests),
    [assistanceRequests, additionalRecords.assistanceRequests],
  );

  const requests = [
    ...allComplaints
      .filter((complaint) =>
        ACTIONABLE_STATUSES.has(normalizeActionableStatus(complaint.status)),
      )
      .map((complaint) => ({
        ...complaint,
        recordType: "complaint" as const,
      })),
    ...allAssistanceRequests
      .filter((request) =>
        ACTIONABLE_STATUSES.has(normalizeActionableStatus(request.status)),
      )
      .map((request) => ({
        ...request,
        recordType: "assistance" as const,
      })),
  ];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-secondary to-primary text-secondary-foreground p-4 sm:p-6 rounded-lg">
        <h1 className="text-xl sm:text-2xl">
          Complaint and Assistance Heatmap
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Barangay 407 Heatmap</CardTitle>
          {paginationError && (
            <CardDescription role="alert">
              Unable to load all pending and in-progress requests:{" "}
              {paginationError}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="w-full max-w-[520px] mx-auto aspect-square">
            <HeatmapPanel
              requests={requests}
              expanded
              mapHeight={500}
              minZoom={15.5}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
