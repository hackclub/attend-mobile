import ActivityKit
import WidgetKit
import SwiftUI

struct AttendLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AttendActivityAttributes.self) { context in
            // Lock Screen / Banner view
            LockScreenView(context: context)
                .widgetURL(URL(string: "attend://scanner"))
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded view (long press)
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 4) {
                        Image(systemName: "qrcode.viewfinder")
                            .foregroundColor(.red)
                        Text("Attend")
                            .font(.caption)
                            .fontWeight(.semibold)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(context.state.checkedInCount)/\(context.state.totalCount)")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.eventName)
                        .font(.headline)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 8) {
                        ProgressView(value: Double(context.state.checkedInCount), total: Double(max(context.state.totalCount, 1)))
                            .progressViewStyle(.linear)
                            .tint(.red)
                        
                        HStack {
                            Text("Checked In")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                            Spacer()
                            Text("\(Int((Double(context.state.checkedInCount) / Double(max(context.state.totalCount, 1))) * 100))%")
                                .font(.caption2)
                                .fontWeight(.medium)
                        }
                        
                        Link(destination: URL(string: "attend://scanner")!) {
                            HStack {
                                Image(systemName: "qrcode.viewfinder")
                                Text("Open Scanner")
                            }
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(Color.red)
                            .cornerRadius(8)
                        }
                    }
                    .padding(.horizontal, 4)
                }
            } compactLeading: {
                Image(systemName: "qrcode.viewfinder")
                    .foregroundColor(.red)
            } compactTrailing: {
                Text("\(context.state.checkedInCount)/\(context.state.totalCount)")
                    .font(.caption2)
                    .fontWeight(.bold)
            } minimal: {
                Image(systemName: "qrcode.viewfinder")
                    .foregroundColor(.red)
            }
            .widgetURL(URL(string: "attend://scanner"))
        }
    }
}

struct LockScreenView: View {
    let context: ActivityViewContext<AttendActivityAttributes>
    
    var progress: Double {
        guard context.state.totalCount > 0 else { return 0 }
        return Double(context.state.checkedInCount) / Double(context.state.totalCount)
    }
    
    var body: some View {
        VStack(spacing: 12) {
            HStack {
                HStack(spacing: 8) {
                    Image(systemName: "qrcode.viewfinder")
                        .font(.title2)
                        .foregroundColor(.red)
                    
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.eventName)
                            .font(.headline)
                            .fontWeight(.semibold)
                            .lineLimit(1)
                        Text("Check-in Progress")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                
                Spacer()
                
                VStack(alignment: .trailing, spacing: 2) {
                    Text("\(context.state.checkedInCount)")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(.red)
                    Text("of \(context.state.totalCount)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            
            VStack(spacing: 4) {
                ProgressView(value: progress)
                    .progressViewStyle(.linear)
                    .tint(.red)
                
                HStack {
                    Text("\(Int(progress * 100))% checked in")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("Tap to scan")
                        .font(.caption2)
                        .foregroundColor(.red)
                }
            }
        }
        .padding(16)
        .activityBackgroundTint(.black.opacity(0.8))
    }
}

#Preview("Lock Screen", as: .content, using: AttendActivityAttributes(eventId: "test-123", eventName: "Hack Club Assemble")) {
    AttendLiveActivity()
} contentStates: {
    AttendActivityAttributes.ContentState(checkedInCount: 42, totalCount: 150, lastUpdated: Date())
    AttendActivityAttributes.ContentState(checkedInCount: 100, totalCount: 150, lastUpdated: Date())
}

// MARK: - Participant ticket Live Activity

struct TicketLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TicketActivityAttributes.self) { context in
            TicketLockScreenView(context: context)
                .widgetURL(URL(string: "attend://my-tickets"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 4) {
                        Image(systemName: "ticket.fill").foregroundColor(.red)
                        Text("Ticket").font(.caption).fontWeight(.semibold)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if context.state.checkedIn {
                        Text("Checked in").font(.caption2).fontWeight(.bold).foregroundColor(.green)
                    } else {
                        Text(context.attributes.startsAt, style: .relative)
                            .font(.caption).fontWeight(.bold).monospacedDigit()
                            .foregroundColor(.white).multilineTextAlignment(.trailing)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.eventName).font(.headline).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Image(systemName: "mappin.and.ellipse").foregroundColor(.secondary)
                        Text(context.attributes.venue).font(.caption).foregroundColor(.secondary).lineLimit(1)
                        Spacer()
                        Text(context.attributes.shortCode).font(.caption).fontWeight(.bold).monospaced()
                    }
                    .padding(.horizontal, 4)
                }
            } compactLeading: {
                Image(systemName: "ticket.fill").foregroundColor(.red)
            } compactTrailing: {
                if context.state.checkedIn {
                    Image(systemName: "checkmark.circle.fill").foregroundColor(.green)
                } else {
                    Text(context.attributes.startsAt, style: .relative)
                        .font(.caption2).fontWeight(.bold).monospacedDigit().frame(maxWidth: 64)
                }
            } minimal: {
                Image(systemName: "ticket.fill").foregroundColor(.red)
            }
            .widgetURL(URL(string: "attend://my-tickets"))
        }
    }
}

struct TicketLockScreenView: View {
    let context: ActivityViewContext<TicketActivityAttributes>

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                HStack(spacing: 8) {
                    Image(systemName: "ticket.fill").font(.title2).foregroundColor(.red)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.eventName)
                            .font(.headline).fontWeight(.semibold).lineLimit(1)
                        HStack(spacing: 4) {
                            Image(systemName: "mappin.and.ellipse").font(.caption2).foregroundColor(.secondary)
                            Text(context.attributes.venue).font(.caption).foregroundColor(.secondary).lineLimit(1)
                        }
                    }
                }
                Spacer()
                if context.state.checkedIn {
                    VStack(alignment: .trailing, spacing: 2) {
                        Image(systemName: "checkmark.circle.fill").font(.title3).foregroundColor(.green)
                        Text("Checked in").font(.caption2).foregroundColor(.green)
                    }
                } else {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(context.attributes.startsAt, style: .relative)
                            .font(.title3).fontWeight(.bold).monospacedDigit()
                            .foregroundColor(.red).multilineTextAlignment(.trailing)
                        Text("until doors").font(.caption2).foregroundColor(.secondary)
                    }
                }
            }
            HStack {
                Text("ATTENDEE PASS").font(.caption2).fontWeight(.bold)
                    .foregroundColor(.secondary).tracking(1)
                Spacer()
                Text(context.attributes.shortCode).font(.caption).fontWeight(.bold).monospaced()
            }
        }
        .padding(16)
        .activityBackgroundTint(.black.opacity(0.85))
    }
}
