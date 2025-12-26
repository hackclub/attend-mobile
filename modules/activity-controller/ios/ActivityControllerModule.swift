import ExpoModulesCore
import ActivityKit

public class ActivityControllerModule: Module {
    public func definition() -> ModuleDefinition {
        Name("ActivityController")
        
        Function("areLiveActivitiesEnabled") { () -> Bool in
            if #available(iOS 16.2, *) {
                return ActivityAuthorizationInfo().areActivitiesEnabled
            }
            return false
        }
        
        AsyncFunction("startLiveActivity") { (eventId: String, eventName: String, checkedInCount: Int, totalCount: Int) -> Bool in
            guard #available(iOS 16.2, *) else { return false }
            
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                return false
            }
            
            // End any existing activities first
            for activity in Activity<AttendActivityAttributes>.activities {
                Task {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
            }
            
            let attributes = AttendActivityAttributes(
                eventId: eventId,
                eventName: eventName
            )
            
            let contentState = AttendActivityAttributes.ContentState(
                checkedInCount: checkedInCount,
                totalCount: totalCount,
                lastUpdated: Date()
            )
            
            let activityContent = ActivityContent(
                state: contentState,
                staleDate: Calendar.current.date(byAdding: .hour, value: 12, to: Date())
            )
            
            do {
                _ = try Activity.request(
                    attributes: attributes,
                    content: activityContent,
                    pushType: nil
                )
                return true
            } catch {
                print("Failed to start Live Activity: \(error)")
                return false
            }
        }
        
        AsyncFunction("updateLiveActivity") { (checkedInCount: Int, totalCount: Int) -> Bool in
            guard #available(iOS 16.2, *) else { return false }
            
            let activities = Activity<AttendActivityAttributes>.activities
            guard let activity = activities.first else {
                return false
            }
            
            let contentState = AttendActivityAttributes.ContentState(
                checkedInCount: checkedInCount,
                totalCount: totalCount,
                lastUpdated: Date()
            )
            
            let alertConfig = AlertConfiguration(
                title: "Check-in Update",
                body: "\(checkedInCount) of \(totalCount) checked in",
                sound: .default
            )
            
            Task {
                await activity.update(
                    ActivityContent(state: contentState, staleDate: nil),
                    alertConfiguration: nil
                )
            }
            
            return true
        }
        
        AsyncFunction("stopLiveActivity") { () -> Bool in
            guard #available(iOS 16.2, *) else { return false }
            
            for activity in Activity<AttendActivityAttributes>.activities {
                Task {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
            }
            
            return true
        }
        
        Function("isLiveActivityRunning") { () -> Bool in
            guard #available(iOS 16.2, *) else { return false }
            return !Activity<AttendActivityAttributes>.activities.isEmpty
        }
    }
}
