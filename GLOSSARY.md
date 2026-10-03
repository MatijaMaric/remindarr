# Remindarr

Tracks streaming movie and TV releases for users and reminds them when things they care about arrive.

## Language

### Following

**User follow**:
One user subscribing to another user's activity and recommendations.
_Avoid_: Friend, subscription

**Person follow**:
A user subscribing to a Person so they hear about that Person's New credits. Shown in the UI as "Follow" on a Person's page.
_Avoid_: Person subscription, watching a person

**Person**:
A real-world cast or crew member (actor, director, showrunner) as known to TMDB.
_Avoid_: Actor, celebrity, talent

**Credit**:
A Person's role (cast or crew) on one movie or show.
_Avoid_: Role, appearance, filmography entry

**New credit**:
A Credit that was not part of the Person's credits when the user started following them or at any later check, and that is undated, upcoming, or released within the last 30 days. Talk-show and news-show credits never count.
_Avoid_: New release, new work, announcement

## Relationships

- A **User** has many **Person follows**; a **Person** is followed by many **Users**
- A **Person** has many **Credits**; a **New credit** is reported once per following **User**, in their daily digest
